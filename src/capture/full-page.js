(() => {
  if (globalThis.__shotRecorderFullPageActive) return;
  globalThis.__shotRecorderFullPageActive = true;

  const host = document.createElement("div");
  host.id = "shot-recorder-fullpage";
  host.style.cssText = "all:initial;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;visibility:visible;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .bar { display:flex; gap:8px; align-items:center; background:#1b1f24; color:#fff;
        font:13px/1.2 system-ui,sans-serif; padding:8px 10px; border-radius:999px;
        box-shadow:0 8px 24px rgba(0,0,0,.25); }
      button { font:inherit; color:#1b1f24; background:#fff; border:0; border-radius:999px; padding:4px 10px; cursor:pointer; }
    </style>
    <div class="bar"><span id="label">Capturing full page…</span><button type="button">Stop</button></div>
  `;
  document.documentElement.append(host);

  const label = shadow.querySelector("#label");
  const html = document.documentElement;
  const body = document.body;
  const savedStyle = {
    htmlBehavior: html.style.scrollBehavior,
    htmlAnchor: html.style.overflowAnchor,
    bodyBehavior: body ? body.style.scrollBehavior : "",
    bodyAnchor: body ? body.style.overflowAnchor : "",
  };
  lockScrollStyle(html);
  if (body) lockScrollStyle(body);
  const savedWindow = { x: window.scrollX, y: window.scrollY };
  const visibility = new Map();
  let scroller = null;
  let mode = "document";
  let savedElementTop = 0;
  let previousElementBehavior = "";
  let previousElementAnchor = "";
  let cleaned = false;
  let pinnedTop = null;
  let pinLock = false;
  let pinFrame = false;

  const found = findScroller();
  mode = found.mode;
  scroller = found.el;
  if (mode === "element") {
    savedElementTop = scroller.scrollTop;
    previousElementBehavior = scroller.style.scrollBehavior;
    previousElementAnchor = scroller.style.overflowAnchor;
    lockScrollStyle(scroller);
    scroller.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
  }

  const scrollNode = mode === "document" ? window : scroller;
  scrollNode.addEventListener("scroll", correctPin, { passive: true });

  const port = chrome.runtime.connect({ name: "fullpage" });
  let capturePending = false;
  port.onMessage.addListener(async (message) => {
    if (message.type === "done" || message.type === "error") {
      cleanup();
      return;
    }
    if (message.type === "captured") {
      capturePending = false;
      showBar();
      return;
    }
    if (message.type === "prepare") {
      hideBar();
      await land(message.scrollTop);
      await frames(2);
      port.postMessage({ type: "ready", index: message.index, scrollTop: readScroll() });
      return;
    }
    if (message.type !== "scroll") return;
    label.textContent = `Capturing ${message.index + 1} / ${message.total}`;
    showBar();
    setFixedHidden(message.hideFixed);
    await land(message.scrollTop);
    await wait(120);
    await land(message.scrollTop);
    capturePending = true;
    port.postMessage({ type: "scrolled", index: message.index });
  });
  port.onDisconnect.addListener(cleanup);
  shadow.querySelector("button").addEventListener("click", () => port.postMessage({ type: "stop" }));
  port.postMessage({ type: "measure", ...measure() });

  function findScroller() {
    const doc = document.scrollingElement || document.documentElement;
    if (doc.scrollHeight > window.innerHeight + 2) return { mode: "document", el: doc };
    let best = null;
    let bestArea = 0;
    for (const el of document.body.querySelectorAll("*")) {
      if (el.id === "shot-recorder-fullpage") continue;
      const style = getComputedStyle(el);
      if (!/(auto|scroll|overlay)/.test(style.overflowY)) continue;
      if (el.scrollHeight <= el.clientHeight + 2) continue;
      const rect = el.getBoundingClientRect();
      const visibleW = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
      const visibleH = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      if (visibleW < 40 || visibleH < 40) continue;
      const area = visibleW * visibleH;
      if (area > bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best ? { mode: "element", el: best } : { mode: "document", el: doc };
  }

  function measure() {
    const scrollbar = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (mode === "document") {
      return {
        mode,
        totalHeight: scroller.scrollHeight,
        viewportHeight: window.innerHeight,
        viewportCssWidth: window.innerWidth,
        dpr: window.devicePixelRatio || 1,
        crop: {
          x: 0,
          y: 0,
          width: Math.max(1, window.innerWidth - scrollbar),
          height: window.innerHeight,
        },
      };
    }
    const rect = scroller.getBoundingClientRect();
    const crop = intersectViewport(rect);
    return {
      mode,
      totalHeight: scroller.scrollHeight,
      viewportHeight: Math.max(1, Math.round(crop.height)),
      viewportCssWidth: window.innerWidth,
      dpr: window.devicePixelRatio || 1,
      crop,
    };
  }

  function intersectViewport(rect) {
    const x = Math.max(0, rect.left);
    const y = Math.max(0, rect.top);
    const right = Math.min(window.innerWidth, rect.right);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  }

  function showBar() {
    if (capturePending) return;
    host.style.setProperty("visibility", "visible", "important");
    host.style.setProperty("transform", "translateX(-50%)", "important");
  }

  function hideBar() {
    // Keep the bar in layout. display:none lets Chrome drop the scroll
    // position back to the previous slice before the screenshot.
    host.style.setProperty("visibility", "hidden", "important");
    host.style.setProperty("transform", "translate(-50%, -200px)", "important");
  }

  function lockScrollStyle(el) {
    el.style.setProperty("scroll-behavior", "auto", "important");
    el.style.setProperty("overflow-anchor", "none", "important");
  }

  function restoreInline(el, prop, previous) {
    el.style.removeProperty(prop);
    if (previous) el.style.setProperty(prop, previous);
  }

  function readScroll() {
    return mode === "document" ? window.scrollY : scroller.scrollTop;
  }

  function scrollToTop(top) {
    pinLock = true;
    const behavior = "instant";
    if (mode === "document") window.scrollTo({ left: 0, top, behavior });
    else scroller.scrollTo({ left: 0, top, behavior });
    pinLock = false;
  }

  function correctPin() {
    if (pinnedTop == null || pinLock || pinFrame) return;
    if (Math.abs(readScroll() - pinnedTop) <= 1) return;
    pinFrame = true;
    requestAnimationFrame(() => {
      pinFrame = false;
      if (pinnedTop == null || pinLock) return;
      if (Math.abs(readScroll() - pinnedTop) <= 1) return;
      scrollToTop(pinnedTop);
    });
  }

  async function land(top) {
    pinnedTop = top;
    scrollToTop(top);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await frames(2);
      if (Math.abs(readScroll() - top) <= 1) return;
      scrollToTop(top);
    }
  }

  function fixedElements() {
    const scope = mode === "element" ? scroller : document.body;
    const list = [];
    for (const el of scope.querySelectorAll("*")) {
      if (el.id === "shot-recorder-fullpage") continue;
      const position = getComputedStyle(el).position;
      if (position === "fixed" || position === "sticky") list.push(el);
    }
    return list;
  }

  function setFixedHidden(hidden) {
    const elements = fixedElements();
    if (hidden) {
      for (const el of elements) {
        if (!visibility.has(el)) visibility.set(el, el.style.visibility);
        el.style.visibility = "hidden";
      }
      return;
    }
    for (const [el, value] of visibility) el.style.visibility = value;
    visibility.clear();
  }

  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    pinnedTop = null;
    scrollNode.removeEventListener("scroll", correctPin);
    for (const [el, value] of visibility) el.style.visibility = value;
    restoreInline(html, "scroll-behavior", savedStyle.htmlBehavior);
    restoreInline(html, "overflow-anchor", savedStyle.htmlAnchor);
    if (body) {
      restoreInline(body, "scroll-behavior", savedStyle.bodyBehavior);
      restoreInline(body, "overflow-anchor", savedStyle.bodyAnchor);
    }
    if (mode === "element" && scroller) {
      restoreInline(scroller, "scroll-behavior", previousElementBehavior);
      restoreInline(scroller, "overflow-anchor", previousElementAnchor);
      scroller.scrollTop = savedElementTop;
    }
    window.scrollTo(savedWindow.x, savedWindow.y);
    host.remove();
    globalThis.__shotRecorderFullPageActive = false;
  }

  function frames(count) {
    return new Promise((resolve) => {
      const step = (left) => {
        if (left <= 0) resolve();
        else requestAnimationFrame(() => step(left - 1));
      };
      step(count);
    });
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
