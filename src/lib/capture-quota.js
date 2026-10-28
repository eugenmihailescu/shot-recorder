// Chrome keeps a one-second window for captureVisibleTab and allows
// MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND calls in it (2). The window
// starts on the first call, so a call every 500ms still trips the third
// slice. Stay strictly under that rate.
export const CAPTURE_GAP_MS = 600;

export function planCaptureSlot(now, reservedUntil, gapMs = CAPTURE_GAP_MS) {
  const startAt = Math.max(now, reservedUntil);
  return { startAt, reservedUntil: startAt + gapMs, waitMs: startAt - now };
}
