// chrome.windows cannot set alwaysOnTop. Document Picture-in-Picture is the
// always-on-top surface an extension page is allowed to open, and only from
// a click. The opener document has to stay alive, so the recorder window is
// minimized behind the controls instead of closed.

export function canFloatControls({ hasApi, activationActive }) {
  return Boolean(hasApi && activationActive);
}

export async function floatRecordingControls(panel, { onClose, title = "Record" } = {}) {
  if (!canFloatControls({
    hasApi: "documentPictureInPicture" in window,
    activationActive: Boolean(navigator.userActivation?.isActive),
  })) {
    return null;
  }
  let pip;
  try {
    pip = await documentPictureInPicture.requestWindow({ width: 380, height: 250 });
  } catch {
    return null;
  }
  const base = pip.document.createElement("style");
  base.textContent = "body{margin:0;background:#f4f6f8}";
  pip.document.head.append(base);
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const copy = link.cloneNode(true);
    copy.href = link.href;
    pip.document.head.append(copy);
  }
  pip.document.title = title;
  pip.document.body.append(panel);
  let closingByUs = false;
  pip.addEventListener("pagehide", () => {
    if (!closingByUs) onClose?.();
  });
  const host = await chrome.windows.getCurrent();
  await chrome.windows.update(host.id, { state: "minimized" }).catch(() => {});
  return {
    hostId: host.id,
    async restore() {
      closingByUs = true;
      if (panel.ownerDocument !== document) document.body.append(panel);
      try { pip.close(); } catch { /* Already closed. */ }
      await chrome.windows.update(host.id, { state: "normal", focused: true }).catch(() => {});
    },
  };
}
