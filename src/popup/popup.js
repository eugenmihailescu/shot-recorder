import { SCRIPT_BLOCKED_MESSAGE, pageAllowsScripting } from "../lib/pages.js";
import { getSettings, recordingChoiceParams } from "../lib/settings.js";
import { CONTROL_WINDOW, SHARE_RECORD_WINDOW } from "../lib/share-window.js";
import { mp4CanRecord } from "../record/mp4.js";

const error = document.querySelector("#error");
const recordOptions = document.querySelector("#record-options");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const settings = await getSettings();
const scriptable = pageAllowsScripting(tab?.url || "");

document.querySelector("#delay").textContent = `(${settings.visibleDelaySec}s)`;
fillRecordingChoices(settings);
const countdown = settings.countdownSec === 0 ? "starts immediately" : `${settings.countdownSec}s countdown`;
document.querySelector("#record-meta").textContent = `For this recording only · ${countdown}`;
const mp4Option = recordOptions.elements.videoFormat.querySelector('option[value="mp4"]');
if (!await mp4CanRecord()) {
  mp4Option.disabled = true;
  document.querySelector("#mp4-note").hidden = false;
  if (recordOptions.elements.videoFormat.value === "mp4") {
    recordOptions.elements.videoFormat.value = "webm";
  }
}

recordOptions.addEventListener("submit", (event) => {
  event.preventDefault();
});

const modeTabs = [...document.querySelectorAll("[role=tab]")];
for (const modeTab of modeTabs) {
  modeTab.addEventListener("click", () => selectMode(modeTab));
  modeTab.addEventListener("keydown", (event) => {
    const current = modeTabs.indexOf(modeTab);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % modeTabs.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + modeTabs.length) % modeTabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = modeTabs.length - 1;
    else return;
    event.preventDefault();
    selectMode(modeTabs[next]);
    modeTabs[next].focus();
  });
}

function selectMode(selected) {
  for (const modeTab of modeTabs) {
    const on = modeTab === selected;
    modeTab.setAttribute("aria-selected", on ? "true" : "false");
    modeTab.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(modeTab.getAttribute("aria-controls"));
    panel.hidden = !on;
    panel.inert = !on;
  }
}

for (const name of ["capture-full", "capture-region"]) {
  const button = document.querySelector(`[data-action="${name}"]`);
  button.disabled = !scriptable;
  if (!scriptable) button.title = SCRIPT_BLOCKED_MESSAGE;
}

const shortcuts = new Map((await chrome.commands.getAll()).map((command) => [command.name, command.shortcut]));
for (const button of document.querySelectorAll("[data-action]")) {
  const shortcut = shortcuts.get(button.dataset.action);
  if (shortcut) button.append(`  ${shortcut}`);
}

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled || !tab?.id) return;
  error.hidden = true;
  const type = button.dataset.action;
  try {
    if (type === "record-tab" || type === "record-desktop") {
      // Open from this click so the recorder page keeps the transient
      // activation and can put Pause and Stop in an always-on-top window.
      // The format, size, and audio fields ride along for this take only.
      const desktop = type === "record-desktop";
      const streamId = desktop ? "" : await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      const size = desktop ? SHARE_RECORD_WINDOW : CONTROL_WINDOW;
      const choices = recordingChoiceParams(readRecordingChoice());
      const query = new URLSearchParams({ mode: desktop ? "desktop" : "tab", tabId: String(tab.id) });
      for (const [key, value] of choices) query.set(key, value);
      if (streamId) query.set("streamId", streamId);
      const opened = window.open(
        chrome.runtime.getURL(`src/record/recorder.html?${query}`),
        "_blank",
        `popup=yes,width=${size.width},height=${size.height}`,
      );
      if (!opened) {
        await send({
          type,
          tabId: tab.id,
          windowId: tab.windowId,
          url: tab.url,
          streamId,
          format: choices.get("format") || "",
          size: choices.get("size") || "",
          mic: choices.get("mic") || "",
          sound: choices.get("sound") || "",
        });
      }
    } else {
      await send({ type, tabId: tab.id, windowId: tab.windowId, url: tab.url });
    }
    window.close();
  } catch (failure) {
    error.hidden = false;
    error.textContent = failure.message;
  }
});

document.querySelector("#options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function fillRecordingChoices(stored) {
  recordOptions.elements.videoFormat.value = stored.videoFormat;
  recordOptions.elements.maxResolution.value = stored.maxResolution;
  recordOptions.elements.microphone.checked = stored.microphone;
  recordOptions.elements.tabSound.checked = stored.tabSound;
}

function readRecordingChoice() {
  const format = recordOptions.elements.videoFormat;
  const mp4 = format.querySelector('option[value="mp4"]');
  return {
    format: format.value === "mp4" && mp4.disabled ? "webm" : format.value,
    size: recordOptions.elements.maxResolution.value,
    mic: recordOptions.elements.microphone.checked ? "1" : "0",
    sound: recordOptions.elements.tabSound.checked ? "1" : "0",
  };
}

function send(message) {
  return chrome.runtime.sendMessage(message).then((response) => {
    if (!response?.ok) throw new Error(response?.error || "Shot Recorder could not do that.");
  });
}
