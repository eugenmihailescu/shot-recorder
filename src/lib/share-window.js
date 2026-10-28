// Brave draws "Choose what to share" inside the extension window that calls
// getDisplayMedia. The card does not grow past about 610px, so a larger
// window shows a gray frame around it. These sizes match the card.
export const SHARE_STILL_WINDOW = { width: 622, height: 504 };
export const SHARE_RECORD_WINDOW = { width: 622, height: 575 };
export const CONTROL_WINDOW = { width: 400, height: 280 };

const SHARE_FIT_SLACK = 16;

// Returns the fitted size when the window is past the card, so the gray
// frame cannot be opened up by dragging the window larger.
export function shareWindowOverflow(current, fitted) {
  if (!current || current.state !== "normal") return null;
  const width = Number(current.width) || 0;
  const height = Number(current.height) || 0;
  if (width <= fitted.width + SHARE_FIT_SLACK && height <= fitted.height + SHARE_FIT_SLACK) return null;
  return { width: fitted.width, height: fitted.height, state: "normal" };
}

export function watchShareWindow(fitted) {
  let hostId = 0;
  let applying = false;
  const remember = chrome.windows.getCurrent().then((current) => {
    hostId = current.id;
  });
  const onChange = (changed) => {
    remember.then(() => {
      if (applying || changed.id !== hostId) return;
      const next = shareWindowOverflow(changed, fitted);
      if (!next) return;
      applying = true;
      chrome.windows.update(changed.id, next).finally(() => {
        applying = false;
      });
    }).catch(() => {});
  };
  chrome.windows.onBoundsChanged.addListener(onChange);
  return () => chrome.windows.onBoundsChanged.removeListener(onChange);
}
