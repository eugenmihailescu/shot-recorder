(() => {
  if (globalThis.__shotRecorderCountdownActive) return;
  const root = document.documentElement;
  if (!root) return;
  const total = Math.max(0, Math.round(Number(globalThis.__shotRecorderCountdownSeconds) || 0));
  delete globalThis.__shotRecorderCountdownSeconds;
  globalThis.__shotRecorderCountdownActive = true;

  const host = document.createElement("div");
  host.id = "shot-recorder-countdown";
  host.setAttribute("aria-hidden", "true");
  // Fixed and pointer-events: none so the page can still be used during the delay.
  host.style.cssText = "all:initial;display:block;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;pointer-events:none;width:148px;height:148px;margin:0;";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .count {
        box-sizing: border-box;
        width: 148px;
        height: 148px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: rgba(27, 31, 36, 0.92);
        color: #fff;
        font: 700 80px/1 system-ui, sans-serif;
        box-shadow: 0 0 0 4px #fff, 0 12px 32px rgba(0, 0, 0, 0.35);
        user-select: none;
        pointer-events: none;
      }
    </style>
    <div class="count"></div>
  `;
  const label = shadow.querySelector(".count");
  let stopped = false;

  let port;
  try {
    port = chrome.runtime.connect({ name: "countdown" });
  } catch (error) {
    globalThis.__shotRecorderCountdownActive = false;
    throw error;
  }
  port.onMessage.addListener((message) => {
    if (message?.type === "hide") hideAndClear();
  });
  port.onDisconnect.addListener(cleanup);
  void run(total);

  async function run(seconds) {
    try {
      for (let left = seconds; left > 0; left -= 1) {
        if (stopped) return;
        label.textContent = String(left);
        if (!host.isConnected) root.append(host);
        // A port message resets the service worker idle timer.
        port.postMessage({ type: "tick", left });
        await sleep(1000);
      }
      if (!stopped) port.postMessage({ type: "due" });
    } catch {
      cleanup();
    }
  }

  async function hideAndClear() {
    if (stopped) {
      try { port.postMessage({ type: "cleared" }); } catch { /* The worker is already gone. */ }
      return;
    }
    stopped = true;
    const shown = host.isConnected;
    host.remove();
    globalThis.__shotRecorderCountdownActive = false;
    // Two frames so the compositor drops the number before the shot.
    if (shown) await frames(2);
    try { port.postMessage({ type: "cleared" }); } catch { /* The worker is already gone. */ }
    try { port.disconnect(); } catch { /* Already disconnected. */ }
  }

  function cleanup() {
    if (stopped) return;
    stopped = true;
    host.remove();
    globalThis.__shotRecorderCountdownActive = false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
})();
