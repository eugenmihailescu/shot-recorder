import { presentStill } from "../lib/present.js";
import { getSettings } from "../lib/settings.js";
import { SHARE_STILL_WINDOW, watchShareWindow } from "../lib/share-window.js";

const status = document.querySelector("#status");
document.title = "Choose what to share with Shot Recorder";

pickAndCapture().catch(async (error) => {
  await restoreWindow();
  status.hidden = false;
  status.textContent = error.message || "Could not capture that screen.";
});

async function pickAndCapture() {
  const releaseFit = watchShareWindow(SHARE_STILL_WINDOW);
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "monitor" },
      audio: false,
      monitorTypeSurfaces: "include",
      selfBrowserSurface: "exclude",
    });
  } catch (error) {
    releaseFit();
    if (error.name === "NotAllowedError") {
      window.close();
      return;
    }
    throw error;
  }
  releaseFit();
  const settings = await getSettings();
  try {
    await holdForDelay(settings.desktopDelaySec);
    const blob = await frameBlob(stream);
    stream.getTracks().forEach((track) => track.stop());
    await presentStill(blob);
    window.close();
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

async function holdForDelay(seconds) {
  const current = await chrome.windows.getCurrent();
  await chrome.windows.update(current.id, { state: "minimized" }).catch(() => {});
  try {
    if (seconds > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: "#c4552a" });
      for (let left = seconds; left > 0; left -= 1) {
        await chrome.action.setBadgeText({ text: String(left) });
        await sleep(1000);
      }
    } else {
      await sleep(400);
    }
  } finally {
    await chrome.action.setBadgeText({ text: "" }).catch(() => {});
  }
}

async function restoreWindow() {
  const current = await chrome.windows.getCurrent();
  await chrome.windows.update(current.id, { state: "normal", focused: true }).catch(() => {});
}

async function frameBlob(stream) {
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  if (video.readyState < 2 || !video.videoWidth) {
    await new Promise((resolve) => video.addEventListener("loadeddata", resolve, { once: true }));
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not capture that screen.");
  return blob;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
