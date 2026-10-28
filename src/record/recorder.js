import { downloadBlob } from "../lib/download.js";
import { formatRecordingName } from "../lib/filename.js";
import { fitInside } from "../lib/geometry.js";
import { CONTROL_WINDOW, SHARE_RECORD_WINDOW, watchShareWindow } from "../lib/share-window.js";
import { RESOLUTION_BOX, applyRecordingChoices, getSettings, recordingChoicesFromSearch } from "../lib/settings.js";
import { AacUnavailable, nativeMp4Mime, startWebCodecsMp4, webCodecsMp4Available } from "./mp4.js";
import { floatRecordingControls } from "./on-top.js";

const params = new URLSearchParams(location.search);
const sessionChoices = recordingChoicesFromSearch(params);
const mode = params.get("mode") === "desktop" ? "desktop" : "tab";
const tabId = Number(params.get("tabId")) || 0;
let streamId = params.get("streamId") || "";

const panel = document.querySelector("main");
const title = document.querySelector("#title");
const status = document.querySelector("#status");
const sizeLabel = document.querySelector("#size");
const warning = document.querySelector("#warning");
const startButton = document.querySelector("#start");
const pauseButton = document.querySelector("#pause");
const resumeButton = document.querySelector("#resume");
const stopButton = document.querySelector("#stop");

title.textContent = mode === "desktop" ? "Record desktop" : "Record this tab";

let recorder = null;
let webCodecs = null;
let chunks = [];
let bytes = 0;
let mime = "video/webm";
let extension = "webm";
let cleanup = async () => {};
let runningSince = 0;
let elapsedMs = 0;
let timer = 0;
let stopping = false;
let abandon = false;
let settings = null;
let floated = null;
let live = false;
let starting = false;
let recorderPort = null;

startButton.addEventListener("click", () => {
  startButton.hidden = true;
  if (mode === "desktop") {
    pickAndRecord().catch(fail);
    return;
  }
  const pending = streamId ? floatRecordingControls(panel, {
    title: "Record this tab",
    onClose: onFloatClose,
  }) : null;
  begin(pending).catch(fail);
});
pauseButton.addEventListener("click", pause);
resumeButton.addEventListener("click", resume);
stopButton.addEventListener("click", () => {
  if (!live) {
    abandon = true;
    try { recorderPort?.disconnect(); } catch { /* Already closed. */ }
    window.close();
    return;
  }
  stop().catch(fail);
});
window.addEventListener("pagehide", () => {
  abandon = true;
  try { recorderPort?.disconnect(); } catch { /* Already closed. */ }
  if (!stopping && live) stop().catch(() => {});
});

// Tab capture does not need another gesture. Ask for the always-on-top
// controls before the first await, while the popup click's activation
// (handed over by window.open) is still active. Desktop has to show the
// share picker first: that call spends the same activation.
const earlyFloat = mode === "tab" && streamId
  ? floatRecordingControls(panel, { title: "Record this tab", onClose: onFloatClose })
  : null;

if (mode === "desktop") {
  panel.hidden = true;
  document.title = "Choose what to share with Shot Recorder";
  pickAndRecord().catch(fail);
} else if (streamId) {
  begin(earlyFloat).catch(fail);
} else {
  startButton.hidden = false;
  status.textContent = "Start recording this tab.";
}

function onFloatClose() {
  floated = null;
  if (stopping) return;
  abandon = true;
  try { recorderPort?.disconnect(); } catch { /* Already closed. */ }
  if (live) stop().finally(() => window.close()).catch(() => {});
  else window.close();
}

async function pickAndRecord() {
  if (starting) return;
  starting = true;
  panel.hidden = true;
  document.title = "Choose what to share with Shot Recorder";
  const releaseFit = watchShareWindow(SHARE_RECORD_WINDOW);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor", frameRate: 30 },
      audio: true,
      monitorTypeSurfaces: "include",
      selfBrowserSurface: "exclude",
    });
  } catch (error) {
    releaseFit();
    starting = false;
    if (abandon) return;
    if (error.name === "NotAllowedError") {
      window.close();
      return;
    }
    throw error;
  }
  releaseFit();
  if (abandon) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  revealPanel();
  document.title = "Record desktop";
  // Sharing confirms with a click. Use that activation, if it is still
  // there, before any other await.
  floated = await floatRecordingControls(panel, {
    title: "Record desktop",
    onClose: onFloatClose,
  });
  await placeControls();
  settings = await loadSettings();
  await captureStream(stream);
}

async function begin(floatPromise) {
  if (floatPromise) floated = await floatPromise;
  startButton.disabled = true;
  revealPanel();
  await placeControls();
  settings = await loadSettings();
  let stream;
  try {
    if (!streamId) streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    stream = await tabStream(streamId, settings.tabSound);
  } catch (error) {
    if (abandon) return;
    throw error;
  }
  if (abandon) {
    stream?.getTracks().forEach((track) => track.stop());
    return;
  }
  await captureStream(stream);
}

async function placeControls() {
  if (floated) {
    await chrome.windows.update(floated.hostId, {
      width: CONTROL_WINDOW.width,
      height: CONTROL_WINDOW.height,
      state: "minimized",
    }).catch(() => {});
    return;
  }
  if (mode !== "desktop") return;
  const current = await chrome.windows.getCurrent();
  await chrome.windows.update(current.id, {
    width: CONTROL_WINDOW.width,
    height: CONTROL_WINDOW.height,
    focused: true,
    state: "normal",
  }).catch(() => {});
}

async function captureStream(stream) {
  try {
    if (abandon) throw new Error("Recording cancelled.");
    await waitForCountdown();
    if (abandon) throw new Error("Recording cancelled.");
    const prepared = await prepareStream(stream, settings);
    cleanup = prepared.cleanup;
    showSize(prepared.width, prepared.height);
    await record(prepared.stream, settings);
  } catch (error) {
    await cleanup().catch(() => {});
    stream?.getTracks().forEach((track) => track.stop());
    if (abandon) return;
    throw error;
  }
}

function waitForCountdown() {
  status.textContent = "Starting…";
  return new Promise((resolve, reject) => {
    let port;
    try {
      port = chrome.runtime.connect({ name: "recorder" });
    } catch (error) {
      reject(error);
      return;
    }
    recorderPort = port;
    let done = false;
    const finish = (error) => {
      if (done) return;
      done = true;
      recorderPort = null;
      try { port.disconnect(); } catch { /* Already closed. */ }
      if (error) reject(error);
      else resolve();
    };
    port.onMessage.addListener((message) => {
      if (message?.type === "armed") {
        status.textContent = "Starts when the countdown ends.";
        stopButton.hidden = false;
        return;
      }
      if (message?.type === "cleared") finish();
      if (message?.type === "failed") {
        finish(new Error(message.error || "Could not finish the countdown."));
      }
    });
    port.onDisconnect.addListener(() => {
      if (!done) finish(new Error("The countdown stopped."));
    });
    try {
      port.postMessage({ type: "arm", tabId });
    } catch (error) {
      finish(error);
    }
  });
}

async function loadSettings() {
  settings = applyRecordingChoices(await getSettings(), sessionChoices);
  return settings;
}

function revealPanel() {
  delete document.documentElement.dataset.pending;
  panel.hidden = false;
}

async function tabStream(id, tabSound) {
  const video = { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: id } };
  const audio = tabSound ? { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: id } } : false;
  return navigator.mediaDevices.getUserMedia({ audio, video });
}

async function prepareStream(stream, current) {
  const box = RESOLUTION_BOX[current.maxResolution];
  const videoTrack = stream.getVideoTracks()[0];
  const trackSettings = videoTrack.getSettings();
  const fitted = fitInside(trackSettings.width || box.width, trackSettings.height || box.height, box.width, box.height);
  let working = stream;
  let stopScale = () => {};
  if (fitted.scaled) {
    const scaled = await scaleVideo(stream, fitted.width, fitted.height);
    working = scaled.stream;
    stopScale = scaled.stop;
  }
  const mixed = await mixMicrophone(working, current.microphone);
  return {
    stream: mixed.stream,
    width: fitted.width,
    height: fitted.height,
    cleanup: async () => {
      stopScale();
      await mixed.stop();
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

async function scaleVideo(stream, width, height) {
  const video = document.createElement("video");
  video.srcObject = new MediaStream(stream.getVideoTracks());
  video.muted = true;
  video.playsInline = true;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  let frame = 0;
  const draw = () => {
    context.drawImage(video, 0, 0, width, height);
    frame = requestAnimationFrame(draw);
  };
  draw();
  const scaled = canvas.captureStream(30);
  for (const track of stream.getAudioTracks()) scaled.addTrack(track);
  return { stream: scaled, stop: () => cancelAnimationFrame(frame) };
}

async function mixMicrophone(stream, enabled) {
  if (!enabled) return { stream, async stop() {} };
  const mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const context = new AudioContext();
  const destination = context.createMediaStreamDestination();
  if (stream.getAudioTracks().length) {
    context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(destination);
  }
  context.createMediaStreamSource(mic).connect(destination);
  const mixed = new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  return {
    stream: mixed,
    async stop() {
      mic.getTracks().forEach((track) => track.stop());
      await context.close();
    },
  };
}

async function record(stream, current) {
  const chosen = await chooseFormat(stream, current);
  mime = chosen.mime;
  extension = chosen.extension;
  live = true;
  pauseButton.hidden = false;
  stopButton.hidden = false;
  status.textContent = "Recording";
  runningSince = Date.now();
  timer = window.setInterval(paintElapsed, 200);
  if (chosen.webcodecs) {
    const box = RESOLUTION_BOX[current.maxResolution];
    const track = stream.getVideoTracks()[0].getSettings();
    const fitted = fitInside(track.width || box.width, track.height || box.height, box.width, box.height);
    try {
      webCodecs = await startWebCodecsMp4(stream, {
        width: fitted.width,
        height: fitted.height,
        bitrate: bitrateFor(fitted.height),
        wantAudio: stream.getAudioTracks().length > 0,
        onBytes: (amount) => noteBytes(amount),
      });
      return;
    } catch (error) {
      if (!(error instanceof AacUnavailable)) throw error;
      status.textContent = error.message;
      const fallback = webmMime();
      mime = fallback;
      extension = "webm";
    }
  }
  recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: bitrateFor(stream.getVideoTracks()[0].getSettings().height || 720),
  });
  recorder.addEventListener("dataavailable", (event) => {
    if (!event.data.size) return;
    chunks.push(event.data);
    noteBytes(event.data.size);
  });
  recorder.start(1000);
}

async function chooseFormat(stream, current) {
  if (current.videoFormat === "mp4") {
    const native = nativeMp4Mime(stream.getAudioTracks().length > 0);
    if (native) return { mime: native, extension: "mp4", webcodecs: false };
    if (await webCodecsMp4Available()) return { mime: "video/mp4", extension: "mp4", webcodecs: true };
    status.textContent = "MP4 is not available in this browser. Recording WebM.";
  }
  return { mime: webmMime(), extension: "webm", webcodecs: false };
}

function webmMime() {
  return ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "video/webm";
}

function noteBytes(amount) {
  bytes += amount;
  if (bytes > 1_000_000_000) warning.hidden = false;
}

function pause() {
  if (recorder?.state === "recording") recorder.pause();
  webCodecs?.pause();
  if (runningSince) elapsedMs += Date.now() - runningSince;
  runningSince = 0;
  pauseButton.hidden = true;
  resumeButton.hidden = false;
  status.textContent = "Paused";
}

function resume() {
  if (recorder?.state === "paused") recorder.resume();
  webCodecs?.resume();
  runningSince = Date.now();
  pauseButton.hidden = false;
  resumeButton.hidden = true;
  status.textContent = "Recording";
}

async function stop() {
  if (stopping) return;
  stopping = true;
  const controls = floated;
  floated = null;
  if (controls) await controls.restore();
  window.clearInterval(timer);
  pauseButton.hidden = true;
  resumeButton.hidden = true;
  stopButton.disabled = true;
  status.textContent = "Saving…";
  let blob;
  if (webCodecs) {
    blob = await webCodecs.stop();
  } else if (recorder && recorder.state !== "inactive") {
    blob = await new Promise((resolve) => {
      recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mime })), { once: true });
      recorder.stop();
    });
  } else if (chunks.length) {
    blob = new Blob(chunks, { type: mime });
  }
  await cleanup();
  if (!blob || !blob.size) {
    status.textContent = "Nothing was recorded.";
    return;
  }
  const latest = settings || await getSettings();
  const name = formatRecordingName(new Date(), latest, extension);
  await downloadBlob(blob, name, latest.downloadDirectory);
  status.textContent = `Saved ${name}`;
}

function paintElapsed() {
  const extra = runningSince ? Date.now() - runningSince : 0;
  const total = Math.floor((elapsedMs + extra) / 1000);
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  sizeLabel.textContent = `${sizeLabel.dataset.size || ""}  ${minutes}:${seconds}`.trim();
}

function showSize(width, height) {
  sizeLabel.dataset.size = `${width}×${height}`;
  sizeLabel.textContent = sizeLabel.dataset.size;
}

function bitrateFor(height) {
  if (height >= 2000) return 20_000_000;
  if (height >= 1000) return 8_000_000;
  return 4_000_000;
}

async function fail(error) {
  starting = false;
  live = false;
  try { recorderPort?.disconnect(); } catch { /* Already closed. */ }
  recorderPort = null;
  if (floated) {
    const controls = floated;
    floated = null;
    await controls.restore().catch(() => {});
  }
  revealPanel();
  status.textContent = error?.message || "Recording failed.";
  startButton.hidden = false;
  startButton.disabled = false;
  pauseButton.hidden = true;
  resumeButton.hidden = true;
  stopButton.hidden = true;
  if (mode === "desktop") startButton.textContent = "Choose again";
}
