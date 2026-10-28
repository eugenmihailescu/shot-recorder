import { maxCaptureCssHeight, planDocumentBands } from "../capture/stitch.js";
import { CONTROL_WINDOW, SHARE_RECORD_WINDOW, SHARE_STILL_WINDOW } from "../lib/share-window.js";
import { CAPTURE_GAP_MS, planCaptureSlot } from "../lib/capture-quota.js";
import { forgetOldCaptures } from "../lib/db.js";
import { blobFromDataUrl, dataUrlFromBytes } from "../lib/download.js";
import { SCRIPT_BLOCKED_MESSAGE, pageAllowsScripting } from "../lib/pages.js";
import { presentStill, showMessage } from "../lib/present.js";
import { countdownFinishAction, recordCountdownPlan } from "../lib/record-countdown.js";
import { getSettings, recordingChoiceParams } from "../lib/settings.js";

forgetOldCaptures().catch(() => {});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(() => {
      try { sendResponse({ ok: true }); } catch { /* The popup may already be gone. */ }
    })
    .catch((error) => {
      const text = error?.message || "Shot Recorder could not finish that capture.";
      let delivered = false;
      try {
        sendResponse({ ok: false, error: text });
        delivered = true;
      } catch { /* Popup closed. */ }
      if (!delivered) showMessage(text);
    });
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  runCommand(command).catch((error) => showMessage(error.message));
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "region") attachRegion(port);
  if (port.name === "fullpage") attachFullPage(port);
  if (port.name === "countdown") attachCountdown(port);
  if (port.name === "recorder") attachRecorder(port);
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case "capture-visible":
      await captureVisibleNow(message.tabId, message.windowId);
      return;
    case "capture-delay":
      await captureVisibleDelayed(message, sender);
      return;
    case "capture-full":
      await startFullPage(message.tabId);
      return;
    case "capture-region":
      await startRegion(message.tabId);
      return;
    case "capture-desktop":
      await openWindow("src/capture/screen.html", SHARE_STILL_WINDOW.width, SHARE_STILL_WINDOW.height);
      return;
    case "record-tab":
      await openRecorder({
        mode: "tab",
        tabId: message.tabId,
        streamId: message.streamId || "",
        format: message.format,
        size: message.size,
        mic: message.mic,
        sound: message.sound,
      });
      return;
    case "record-desktop":
      await openRecorder({
        mode: "desktop",
        tabId: message.tabId,
        format: message.format,
        size: message.size,
        mic: message.mic,
        sound: message.sound,
      });
      return;
    default:
      throw new Error("Unknown action.");
  }
}

async function runCommand(command) {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) throw new Error("No active tab.");
  if (command === "record-tab") {
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    await openRecorder({ mode: "tab", tabId: tab.id, streamId });
    return;
  }
  if (command === "record-desktop") {
    await openRecorder({ mode: "desktop", tabId: tab.id });
    return;
  }
  await handleMessage({
    type: command,
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
  });
}

let captureReservedUntil = 0;

async function captureDataUrl(windowId, beforeCapture) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const slot = planCaptureSlot(Date.now(), captureReservedUntil);
    captureReservedUntil = slot.reservedUntil;
    if (slot.waitMs > 0) await sleep(slot.waitMs);
    try {
      if (beforeCapture) await beforeCapture();
      // The gap is measured from the capture itself. Preparing the page
      // sits after the quota wait and must not pull the next shot forward.
      captureReservedUntil = Date.now() + CAPTURE_GAP_MS;
      return await requestCapture(windowId);
    } catch (error) {
      if (attempt === 1 || !isCaptureQuotaError(error)) throw error;
      captureReservedUntil = Date.now() + 1100;
    }
  }
  throw new Error("Could not capture this tab.");
}

function requestCapture(windowId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        reject(new Error(chrome.runtime.lastError?.message || "Could not capture this tab."));
        return;
      }
      resolve(dataUrl);
    });
  });
}

function isCaptureQuotaError(error) {
  return /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND/.test(error?.message || "");
}

async function captureVisibleNow(tabId, windowId) {
  await assertActive(tabId, windowId);
  const blob = blobFromDataUrl(await captureDataUrl(windowId));
  await presentStill(blob);
}

let visibleDelay = null;

function isPopupSender(sender) {
  return typeof sender?.url === "string" && sender.url.includes("/src/popup/popup.html");
}

function releaseDelay(session) {
  session.settled = true;
  if (visibleDelay === session) visibleDelay = null;
}

async function captureVisibleDelayed(message, sender) {
  if (visibleDelay && !visibleDelay.settled) {
    throw new Error("A delayed capture is already running.");
  }
  const session = {
    purpose: "still",
    kind: "pending",
    settled: false,
    armed: false,
    shooting: false,
    port: null,
    tabId: message.tabId,
    windowId: message.windowId,
    url: "",
    seconds: 0,
  };
  visibleDelay = session;
  try {
    if (!session.tabId) throw new Error("No active tab.");
    const settings = await getSettings();
    const started = await chrome.tabs.get(session.tabId);
    session.url = message.url || started.url || "";
    session.seconds = settings.visibleDelaySec;
    if (session.seconds <= 0) {
      releaseDelay(session);
      await captureVisibleNow(session.tabId, session.windowId);
      return;
    }
    if (!pageAllowsScripting(session.url)) {
      session.kind = "badge";
      session.armed = true;
      const job = finishBadge(session);
      // The popup waits only until this returns, then closes. The badge
      // loop keeps running on its own.
      if (isPopupSender(sender)) {
        job.catch((error) => showMessage(error?.message || "Shot Recorder could not finish that capture."));
        return;
      }
      await job;
      return;
    }
    session.kind = "page";
    await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      func: (value) => { globalThis.__shotRecorderCountdownSeconds = value; },
      args: [session.seconds],
    });
    await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      files: ["src/capture/countdown.js"],
    });
    if (session.settled) throw new Error("The tab changed before the screenshot was taken.");
    if (!session.port) throw new Error("A delayed capture is already running.");
    session.armed = true;
    // The number is already on the page. The shot happens when it reports due.
  } catch (error) {
    session.settled = true;
    try { session.port?.postMessage({ type: "hide" }); } catch { /* The page script is already gone. */ }
    if (visibleDelay === session) visibleDelay = null;
    throw error;
  }
}

async function finishBadge(session) {
  const { tabId, windowId, seconds, url } = session;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: "#c4552a", tabId });
    for (let left = seconds; left > 0; left -= 1) {
      await chrome.action.setBadgeText({ text: String(left), tabId });
      await sleep(1000);
    }
    const fresh = await chrome.tabs.get(tabId);
    if ((fresh.url || "") !== url) {
      throw new Error("The tab changed before the screenshot was taken.");
    }
    await assertActive(tabId, windowId);
    const blob = blobFromDataUrl(await captureDataUrl(windowId));
    await presentStill(blob);
  } finally {
    releaseDelay(session);
    await clearBadge(tabId);
  }
}

function attachCountdown(port) {
  const tab = port.sender?.tab;
  const session = visibleDelay;
  if (!tab?.id || !session || session.kind !== "page" || session.tabId !== tab.id || session.port) {
    try { port.disconnect(); } catch { /* Already closed. */ }
    return;
  }
  session.port = port;
  port.onDisconnect.addListener(() => {
    if (session.settled || session.shooting) return;
    const armed = session.armed;
    releaseDelay(session);
    if (session.purpose === "record") {
      notifyRecorder(session, {
        type: "failed",
        error: "The tab changed before the recording started.",
      });
      return;
    }
    if (armed) showMessage("The tab changed before the screenshot was taken.");
  });
  port.onMessage.addListener((message) => {
    if (message?.type === "due") onCountdownDue(session);
  });
}

function onCountdownDue(session) {
  if (session.settled || session.shooting) return;
  session.shooting = true;
  if (countdownFinishAction(session.purpose) === "record") {
    finishRecordCountdown(session).catch(() => {});
    return;
  }
  takeCountdownShot(session).catch((error) => {
    showMessage(error?.message || "Shot Recorder could not finish that capture.");
  });
}

function attachRecorder(port) {
  const handle = { session: null, closed: false };
  port.onDisconnect.addListener(() => {
    handle.closed = true;
    const session = handle.session;
    if (!session || session.settled || session.shooting) return;
    session.settled = true;
    try { session.port?.postMessage({ type: "hide" }); } catch { /* The page script is already gone. */ }
    if (visibleDelay === session) visibleDelay = null;
    if (session.tabId) clearBadge(session.tabId);
  });
  port.onMessage.addListener((message) => {
    if (message?.type !== "arm" || handle.session) return;
    armRecordCountdown(message, port, handle).catch((error) => {
      try {
        port.postMessage({ type: "failed", error: error?.message || "Could not start the countdown." });
      } catch { /* The recorder window is already gone. */ }
    });
  });
}

async function armRecordCountdown(message, recorderPort, handle) {
  if (visibleDelay && !visibleDelay.settled) {
    throw new Error("A countdown is already running.");
  }
  const session = {
    purpose: "record",
    kind: "pending",
    settled: false,
    armed: false,
    shooting: false,
    port: null,
    recorderPort,
    tabId: Number(message.tabId) || 0,
    url: "",
    seconds: 0,
  };
  visibleDelay = session;
  handle.session = session;
  if (handle.closed) {
    releaseDelay(session);
    return;
  }
  try {
    const settings = await getSettings();
    if (session.settled) return;
    let scriptable = false;
    if (session.tabId) {
      try {
        const tab = await chrome.tabs.get(session.tabId);
        session.url = tab.url || "";
        scriptable = pageAllowsScripting(session.url);
      } catch {
        session.tabId = 0;
      }
    }
    if (session.settled) return;
    const plan = recordCountdownPlan({ seconds: settings.countdownSec, scriptable });
    session.seconds = plan.seconds;
    session.kind = plan.kind;
    if (plan.kind === "immediate") {
      releaseDelay(session);
      notifyRecorder(session, { type: "cleared" });
      return;
    }
    notifyRecorder(session, { type: "armed", seconds: plan.seconds, kind: plan.kind });
    if (session.settled) return;
    if (plan.kind === "badge") {
      session.armed = true;
      void runRecordBadge(session);
      return;
    }
    await injectRecordCountdown(session);
  } catch (error) {
    if (!session.settled) releaseDelay(session);
    throw error;
  }
}

async function injectRecordCountdown(session) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      func: (value) => { globalThis.__shotRecorderCountdownSeconds = value; },
      args: [session.seconds],
    });
    await chrome.scripting.executeScript({
      target: { tabId: session.tabId },
      files: ["src/capture/countdown.js"],
    });
  } catch {
    if (session.settled) return;
    session.kind = "badge";
    session.armed = true;
    void runRecordBadge(session);
    return;
  }
  if (session.settled) return;
  if (!session.port) {
    session.kind = "badge";
    session.armed = true;
    void runRecordBadge(session);
    return;
  }
  session.armed = true;
}

async function runRecordBadge(session) {
  const { tabId, seconds } = session;
  try {
    if (tabId) await chrome.action.setBadgeBackgroundColor({ color: "#c4552a", tabId }).catch(() => {});
    for (let left = seconds; left > 0; left -= 1) {
      if (session.settled) return;
      if (tabId) await chrome.action.setBadgeText({ text: String(left), tabId }).catch(() => {});
      await sleep(1000);
    }
    if (session.settled) return;
    session.shooting = true;
    releaseDelay(session);
    notifyRecorder(session, { type: "cleared" });
  } finally {
    if (tabId) await clearBadge(tabId);
  }
}

async function finishRecordCountdown(session) {
  try {
    await releaseCountdown(session);
    releaseDelay(session);
    notifyRecorder(session, { type: "cleared" });
  } catch (error) {
    if (!session.settled) releaseDelay(session);
    notifyRecorder(session, {
      type: "failed",
      error: error?.message || "Could not hide the countdown before the recording.",
    });
  }
}

function notifyRecorder(session, message) {
  try { session.recorderPort?.postMessage(message); } catch { /* The recorder window is already gone. */ }
}

async function takeCountdownShot(session) {
  try {
    const fresh = await chrome.tabs.get(session.tabId);
    if ((fresh.url || "") !== session.url) {
      throw new Error("The tab changed before the screenshot was taken.");
    }
    await assertActive(session.tabId, session.windowId);
    // Quota wait happens before this callback, so the number stays up
    // through that wait and is removed on the frame before the shot.
    const blob = blobFromDataUrl(await captureDataUrl(session.windowId, async () => {
      const latest = await chrome.tabs.get(session.tabId);
      if ((latest.url || "") !== session.url) {
        throw new Error("The tab changed before the screenshot was taken.");
      }
      await assertActive(session.tabId, session.windowId);
      await releaseCountdown(session);
    }));
    await presentStill(blob);
  } catch (error) {
    try { session.port?.postMessage({ type: "hide" }); } catch { /* The page script is already gone. */ }
    throw error;
  } finally {
    releaseDelay(session);
  }
}

function releaseCountdown(session) {
  const changed = session.purpose === "record"
    ? "The tab changed before the recording started."
    : "The tab changed before the screenshot was taken.";
  const hidden = session.purpose === "record"
    ? "Could not hide the countdown before the recording."
    : "Could not hide the countdown before the screenshot.";
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      session.port.onMessage.removeListener(onCleared);
      session.port.onDisconnect.removeListener(onGone);
      if (error) reject(error);
      else resolve();
    };
    const onCleared = (message) => {
      if (message?.type === "cleared") finish();
    };
    const onGone = () => finish(new Error(changed));
    const timer = setTimeout(() => {
      finish(new Error(hidden));
    }, 800);
    session.port.onMessage.addListener(onCleared);
    session.port.onDisconnect.addListener(onGone);
    try {
      session.port.postMessage({ type: "hide" });
    } catch {
      finish(new Error(hidden));
    }
  });
}

async function assertActive(tabId, windowId) {
  const [active] = await chrome.tabs.query({ active: true, windowId });
  if (!active || active.id !== tabId) {
    throw new Error("That tab is no longer the visible tab.");
  }
}

async function requireScriptable(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!pageAllowsScripting(tab.url || "")) throw new Error(SCRIPT_BLOCKED_MESSAGE);
  return tab;
}

async function startRegion(tabId) {
  await requireScriptable(tabId);
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/overlay/overlay.js"],
  });
}

function attachRegion(port) {
  const tab = port.sender?.tab;
  if (!tab?.id) return;
  port.onMessage.addListener((message) => {
    if (message.type !== "action") return;
    cropRegion(tab, message)
      .then(async (blob) => {
        if (message.action === "copy") {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          // Port messages are JSON. An ArrayBuffer arrives as {} and the clipboard rejects it.
          port.postMessage({ type: "png", dataUrl: dataUrlFromBytes(bytes) });
          return;
        }
        await presentStill(blob);
        port.postMessage({ type: "done" });
      })
      .catch((error) => {
        port.postMessage({ type: "failed", error: error.message || "Could not capture that area." });
      });
  });
}

async function cropRegion(tab, message) {
  const bitmap = await createImageBitmap(blobFromDataUrl(await captureDataUrl(tab.windowId)));
  const dpr = message.viewportWidth ? bitmap.width / message.viewportWidth : message.dpr || 1;
  const [sx, sw] = clampSpan(Math.round(message.rect.x * dpr), Math.round(message.rect.width * dpr), bitmap.width);
  const [sy, sh] = clampSpan(Math.round(message.rect.y * dpr), Math.round(message.rect.height * dpr), bitmap.height);
  const canvas = new OffscreenCanvas(sw, sh);
  canvas.getContext("2d").drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
  bitmap.close();
  return canvas.convertToBlob({ type: "image/png" });
}

function clampSpan(start, size, limit) {
  const safeStart = Math.max(0, Math.min(start, Math.max(0, limit - 1)));
  const safeSize = Math.max(1, Math.min(size, limit - safeStart));
  return [safeStart, safeSize];
}

let fullPage = null;

async function startFullPage(tabId) {
  await requireScriptable(tabId);
  if (fullPage && !fullPage.finished) throw new Error("A full page capture is already running.");
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["src/capture/full-page.js"],
  });
}

function attachFullPage(port) {
  const tab = port.sender?.tab;
  if (!tab?.id) return;
  const session = {
    port,
    tabId: tab.id,
    windowId: tab.windowId,
    meta: null,
    plan: null,
    index: -1,
    canvas: null,
    ctx: null,
    dpr: 1,
    stop: false,
    drawing: false,
    finished: false,
  };
  fullPage = session;
  port.onDisconnect.addListener(() => {
    session.stop = true;
    if (!session.finished && !session.drawing) {
      finishFullPage(session).catch((error) => failFullPage(session, error));
    }
  });
  port.onMessage.addListener((message) => {
    onFullPageMessage(session, message).catch((error) => failFullPage(session, error));
  });
}

async function onFullPageMessage(session, message) {
  if (message.type === "stop") {
    session.stop = true;
    if (!session.drawing && session.canvas) await finishFullPage(session);
    else if (!session.drawing && session.plan && !session.canvas) await cancelFullPage(session);
    return;
  }
  if (message.type === "measure") {
    session.meta = message;
    const cap = maxCaptureCssHeight(message.dpr, message.viewportHeight);
    session.plan = planDocumentBands(message.totalHeight, message.viewportHeight, cap);
    if (!session.plan.bands.length) throw new Error("This page has nothing to capture.");
    session.index = 0;
    sendScroll(session);
    return;
  }
  if (message.type === "scrolled") {
    if (message.index !== session.index || session.finished) return;
    session.drawing = true;
    try {
      await drawSlice(session);
    } finally {
      session.drawing = false;
    }
    const last = session.index + 1 >= session.plan.bands.length;
    if (session.stop || last) {
      await finishFullPage(session);
      return;
    }
    try { session.port.postMessage({ type: "captured" }); } catch { /* The page script is already gone. */ }
    session.index += 1;
    sendScroll(session);
  }
}

function sendScroll(session) {
  const band = session.plan.bands[session.index];
  session.port.postMessage({
    type: "scroll",
    index: session.index,
    total: session.plan.bands.length,
    scrollTop: band.scrollTop,
    hideFixed: session.index > 0,
  });
  chrome.action.setBadgeBackgroundColor({ color: "#1f6feb", tabId: session.tabId }).catch(() => {});
  chrome.action.setBadgeText({ text: String(session.index + 1), tabId: session.tabId }).catch(() => {});
}

function holdStill(session) {
  const band = session.plan.bands[session.index];
  return new Promise((resolve) => {
    let settled = false;
    let retried = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.port.onMessage.removeListener(onReady);
      resolve();
    };
    const onReady = (message) => {
      if (message?.type !== "ready" || message.index !== session.index) return;
      const landed = message.scrollTop;
      if (!retried && Number.isFinite(landed) && Math.abs(landed - band.scrollTop) > 2) {
        retried = true;
        try {
          session.port.postMessage({ type: "prepare", index: session.index, scrollTop: band.scrollTop });
        } catch {
          finish();
        }
        return;
      }
      finish();
    };
    const timer = setTimeout(finish, 800);
    session.port.onMessage.addListener(onReady);
    try {
      session.port.postMessage({
        type: "prepare",
        index: session.index,
        scrollTop: band.scrollTop,
      });
    } catch {
      finish();
    }
  });
}

async function drawSlice(session) {
  const bitmap = await createImageBitmap(blobFromDataUrl(await captureDataUrl(session.windowId, () => holdStill(session))));
  const band = session.plan.bands[session.index];
  if (!session.canvas) {
    session.dpr = bitmap.width / session.meta.viewportCssWidth;
    const width = Math.max(1, Math.round(session.meta.crop.width * session.dpr));
    const height = Math.max(1, Math.round(session.plan.covered * session.dpr));
    try {
      session.canvas = new OffscreenCanvas(width, height);
    } catch {
      bitmap.close();
      throw new Error("This page is too tall to stitch. Use Stop earlier, or capture the visible part.");
    }
    session.ctx = session.canvas.getContext("2d", { alpha: false });
  }
  const dpr = session.dpr;
  const [sx, sw] = clampSpan(Math.round(session.meta.crop.x * dpr), Math.round(session.meta.crop.width * dpr), bitmap.width);
  const [sy, sh] = clampSpan(
    Math.round((session.meta.crop.y + band.srcY) * dpr),
    Math.round(band.srcH * dpr),
    bitmap.height,
  );
  const dw = Math.round(session.meta.crop.width * dpr);
  const dh = Math.round(band.srcH * dpr);
  session.ctx.drawImage(bitmap, sx, sy, sw, sh, 0, Math.round(band.destY * dpr), dw, dh);
  bitmap.close();
}

async function finishFullPage(session) {
  if (session.finished) return;
  session.finished = true;
  await clearBadge(session.tabId);
  try { session.port.postMessage({ type: "done" }); } catch { /* The page script is already gone. */ }
  if (!session.canvas) {
    showMessage("Capture cancelled.");
    return;
  }
  const blob = await session.canvas.convertToBlob({ type: "image/png" });
  const incomplete = session.plan && session.index + 1 < session.plan.bands.length;
  await presentStill(blob, {
    truncated: Boolean(session.plan?.truncated || session.stop || incomplete),
    note: session.meta?.mode === "element" ? "Captured the scrolling region." : "",
  });
}

async function cancelFullPage(session) {
  if (session.finished) return;
  session.finished = true;
  await clearBadge(session.tabId);
  try { session.port.postMessage({ type: "done" }); } catch { /* Already gone. */ }
  showMessage("Capture cancelled.");
}

function failFullPage(session, error) {
  if (session.finished) return;
  session.finished = true;
  clearBadge(session.tabId);
  try { session.port.postMessage({ type: "error" }); } catch { /* Already gone. */ }
  showMessage(error?.message || "Full page capture failed.");
}

async function openRecorder(params) {
  const query = new URLSearchParams();
  query.set("mode", params.mode);
  if (params.tabId) query.set("tabId", String(params.tabId));
  if (params.streamId) query.set("streamId", params.streamId);
  for (const [key, value] of recordingChoiceParams(params)) query.set(key, value);
  const size = params.mode === "desktop" ? SHARE_RECORD_WINDOW : CONTROL_WINDOW;
  await openWindow(`src/record/recorder.html?${query.toString()}`, size.width, size.height);
}

function openWindow(path, width, height) {
  return chrome.windows.create({
    url: chrome.runtime.getURL(path),
    type: "popup",
    width,
    height,
    focused: true,
  });
}

async function clearBadge(tabId) {
  try {
    await chrome.action.setBadgeText({ text: "", tabId });
  } catch {
    // The tab closed during the capture.
  }
}
