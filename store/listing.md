# Chrome Web Store listing for Shot Recorder 0.1.0

Paste these fields into the [developer dashboard](https://chrome.google.com/webstore/devconsole). The zip to upload is `dist/shot-recorder-0.1.0.zip`. This file is not part of that zip.

The privacy policy page is https://github.com/eugenmihailescu/shot-recorder/blob/main/store/privacy.html. Open that URL once before you submit. The dashboard rejects a policy link that does not load.

You still take at least one screenshot of the real popup or editor, at 1280×800 or 640×400, and you still click Submit for review.

## Store listing

- Language: English
- Name: Shot Recorder
- Category: Productivity
- Homepage: https://github.com/eugenmihailescu/shot-recorder
- Support: https://github.com/eugenmihailescu/shot-recorder/issues
- Icon: `icons/icon128.png`

### Summary

Take a screenshot or screen recording when you click. Captures stay on this computer.

### Description

Shot Recorder takes a screenshot or a screen recording when you click its toolbar button or use a keyboard shortcut. It runs only for that action. It does not stay injected in the page.

Screenshots

- Visible part of the current tab, with an optional countdown.
- Full page, by scrolling the tab and joining the slices.
- A region you select. You can capture it or copy it.
- A screen or an application window you share.

You can download, copy, print, or edit a still. The editor can resize, crop, draw, highlight, add shapes, arrows, and text, and blur a zone.

Recording

- The current tab, or the desktop.
- WebM or MP4, at 720p, 1080p, or 4K, with a countdown.
- Optional microphone, and optional sound from the tab.
- If a recording includes sound and this browser cannot store that sound in an MP4 file, that take is saved as WebM.

Full page and selected area work on http, https, and file pages. On browser pages, the Chrome Web Store, and other extension pages, use Visible part or Entire screen.

Captures stay in this browser profile or in a downloads folder you choose. The extension does not upload them. There is no account.

Permissions are activeTab, scripting, storage, tabCapture, and downloads. A script is injected only into the tab you just chose, and only for that capture. There is no host permission and no content script that stays installed.

Suggested shortcuts, which you can change at chrome://extensions/shortcuts or brave://extensions/shortcuts:

- Visible part: Alt+Shift+V
- Full page: Alt+Shift+F
- Selected area: Alt+Shift+A
- Record this tab: Alt+Shift+R

Shot Recorder is free. Source: https://github.com/eugenmihailescu/shot-recorder

## Privacy

### Single purpose

Capture a screenshot or screen recording when the user clicks the toolbar button or presses a shortcut, then let them edit, copy, or save that capture on their device.

### Permission justifications

activeTab: After the user clicks the toolbar button or uses a shortcut, read the current tab so the extension can capture its visible area or inject the one-shot countdown, full-page, or region script into that tab.

scripting: Inject the packaged files src/capture/countdown.js, src/capture/full-page.js, or src/overlay/overlay.js into the tab the user just chose. The script draws a countdown or a selection for that capture and does not stay installed. There is no host permission.

storage: Save the user's options in chrome.storage.local on this device. Options are delays, image format, file names, editor tool settings, and the recording format, size, microphone, and tab-sound defaults.

tabCapture: When the user chooses Record this tab, obtain a media stream id for that tab so the recording can include its picture and, if the user left tab sound on, its audio.

downloads: Save the PNG, JPEG, WebM, or MP4 the user chose to download into the folder named in Options.

### Remote code

No, I am not using remote code.

All script is in the package. vendor/mp4-muxer.js is mp4-muxer 5.2.2 (MIT), vendored. See vendor/NOTICE. The extension does not fetch code or data.

### Data use

Check Website content.

A capture is the page, region, screen, or recording the user asked for, including microphone audio only when the user turns that on. Stills are stored in IndexedDB in this profile and deleted about two days later. Recordings and downloaded stills are files in the user's downloads folder. Nothing is uploaded.

Leave these unchecked: Personally identifiable information, Health information, Financial and payment information, Authentication information, Personal communications, Location, Web history, and User activity.

The tab address is read in memory during the capture the user started. It is not saved and is not a browsing history.

Check the three certification boxes. Their labels are:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

### Privacy policy URL

https://github.com/eugenmihailescu/shot-recorder/blob/main/store/privacy.html

## Distribution

- Free. No in-app purchases.
- Visibility: Public, unless you want Unlisted (install only from the listing URL) or Private (trusted testers on this publisher account).
- Regions: all countries the dashboard offers.

## Test instructions

No account, password, or server is required. The extension makes no network request.

1. Install the uploaded package. Pin Shot Recorder.
2. Open https://example.com.
3. Click the toolbar icon. On Screenshot, choose Visible part. An editor tab opens with the captured image. Crop, copy, and download work on this computer.
4. Choose Selected area and drag a rectangle. The editor opens with that crop.
5. Choose Full page. The tab scrolls, then the editor opens with the joined image.
6. Open the Recording tab. Leave the microphone off. Choose This tab, let the countdown finish, then stop. A WebM or MP4 file appears under the ShotRecorder folder in Downloads.
7. Choose Entire screen. The browser share dialog opens. Cancel it and confirm that no file is saved.
8. On chrome://extensions, Full page and Selected area are unavailable. Visible part still captures the tab.
9. Open Options, change the countdown, and reopen the popup. The new value is kept in chrome.storage.local.

Desktop capture and the microphone both wait for the browser permission prompt. Denying that prompt saves nothing.
