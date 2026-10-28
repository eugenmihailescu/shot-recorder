import { formatShotName, imageExtension } from "../lib/filename.js";
import { getSettings, saveSettings } from "../lib/settings.js";
import { mp4CanRecord } from "../record/mp4.js";

const form = document.querySelector("#options");
const status = document.querySelector("#status");
const example = document.querySelector("#example");
const qualityValue = document.querySelector("#quality-value");
const quality = form.elements.jpegQuality;
const imageType = form.elements.imageType;
const mp4Note = document.querySelector("#mp4-note");

const mp4Option = form.elements.videoFormat.querySelector('option[value="mp4"]');

const stored = await getSettings();
fill(stored);
paintExample(stored);
if (!await mp4CanRecord()) {
  mp4Option.disabled = true;
  mp4Note.hidden = false;
  if (form.elements.videoFormat.value === "mp4") {
    form.elements.videoFormat.value = "webm";
    await persist();
  }
}

form.addEventListener("change", () => {
  persist().catch((error) => { status.textContent = error.message; });
});
quality.addEventListener("input", () => {
  qualityValue.textContent = quality.value;
});

document.querySelector("#open-shortcuts").addEventListener("click", async () => {
  const urls = ["brave://extensions/shortcuts", "chrome://extensions/shortcuts"];
  for (const url of urls) {
    try {
      await chrome.tabs.create({ url });
      return;
    } catch {
      // brave:// often cannot be opened from an extension page.
    }
  }
  document.querySelector("#shortcut-fallback").hidden = false;
});

function fill(settings) {
  form.elements.visibleDelaySec.value = String(settings.visibleDelaySec);
  form.elements.desktopDelaySec.value = String(settings.desktopDelaySec);
  imageType.value = settings.imageType;
  quality.value = String(Math.round(settings.jpegQuality * 100));
  qualityValue.textContent = quality.value;
  quality.disabled = settings.imageType !== "jpeg";
  form.elements.downloadDirectory.value = settings.downloadDirectory;
  form.elements.dateOrder.value = settings.dateOrder;
  form.elements.hourClock.value = settings.hourClock;
  form.elements.openEditor.checked = settings.openEditor;
  form.elements.alsoDownload.checked = settings.alsoDownload;
  form.elements.countdownSec.value = String(settings.countdownSec);
  form.elements.videoFormat.value = settings.videoFormat;
  form.elements.maxResolution.value = settings.maxResolution;
  form.elements.microphone.checked = settings.microphone;
  form.elements.tabSound.checked = settings.tabSound;
}

async function persist() {
  const latest = await getSettings();
  const next = await saveSettings({
    ...latest,
    visibleDelaySec: form.elements.visibleDelaySec.value,
    desktopDelaySec: form.elements.desktopDelaySec.value,
    imageType: imageType.value,
    jpegQuality: Number(quality.value) / 100,
    downloadDirectory: form.elements.downloadDirectory.value,
    dateOrder: form.elements.dateOrder.value,
    hourClock: form.elements.hourClock.value,
    openEditor: form.elements.openEditor.checked,
    alsoDownload: form.elements.alsoDownload.checked,
    countdownSec: form.elements.countdownSec.value,
    videoFormat: mp4Option.disabled && form.elements.videoFormat.value === "mp4" ? "webm" : form.elements.videoFormat.value,
    maxResolution: form.elements.maxResolution.value,
    microphone: form.elements.microphone.checked,
    tabSound: form.elements.tabSound.checked,
  });
  fill(next);
  paintExample(next);
  status.textContent = "Saved";
}

function paintExample(settings) {
  example.textContent = formatShotName(new Date(), settings, imageExtension(settings));
}
