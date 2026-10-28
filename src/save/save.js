import { getCapture } from "../lib/db.js";
import { downloadBlob, encodeStill } from "../lib/download.js";
import { formatShotName, imageExtension } from "../lib/filename.js";
import { getSettings } from "../lib/settings.js";

const id = new URLSearchParams(location.search).get("id");
const status = document.querySelector("#status");

try {
  const record = await getCapture(id);
  if (!record?.blob) throw new Error("This capture is no longer available.");
  const settings = await getSettings();
  const blob = await encodeStill(record.blob, settings);
  await downloadBlob(blob, formatShotName(new Date(), settings, imageExtension(settings)), settings.downloadDirectory);
  window.close();
} catch (error) {
  status.textContent = error.message;
}
