// Recording uses the same page countdown as a delayed screenshot.
// The service worker chooses where the numbers go; the page script does not
// know whether a still or a recording follows.
export function recordCountdownPlan({ seconds, scriptable }) {
  const count = Math.max(0, Math.min(10, Math.round(Number(seconds) || 0)));
  if (count <= 0) return { kind: "immediate", seconds: 0 };
  if (!scriptable) return { kind: "badge", seconds: count };
  return { kind: "page", seconds: count };
}

export function countdownFinishAction(purpose) {
  return purpose === "record" ? "record" : "still";
}
