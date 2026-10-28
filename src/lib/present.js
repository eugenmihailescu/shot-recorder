import { putCapture } from "./db.js";
import { getSettings } from "./settings.js";

export async function presentStill(blob, meta = {}) {
  const settings = await getSettings();
  const id = crypto.randomUUID();
  await putCapture({
    id,
    blob,
    createdAt: Date.now(),
    mime: blob.type || "image/png",
    truncated: Boolean(meta.truncated),
    note: meta.note || "",
  });
  const download = settings.alsoDownload || !settings.openEditor;
  if (settings.openEditor) {
    const url = new URL(chrome.runtime.getURL("src/editor/editor.html"));
    url.searchParams.set("id", id);
    if (download) url.searchParams.set("download", "1");
    await chrome.tabs.create({ url: url.toString() });
    return id;
  }
  const save = new URL(chrome.runtime.getURL("src/save/save.html"));
  save.searchParams.set("id", id);
  await chrome.tabs.create({ url: save.toString(), active: true });
  return id;
}

export function showMessage(text) {
  const url = new URL(chrome.runtime.getURL("src/message/message.html"));
  url.searchParams.set("text", text);
  chrome.windows.create({
    url: url.toString(),
    type: "popup",
    width: 420,
    height: 180,
    focused: true,
  });
}
