# Shot Recorder

Screenshot and screen recording for Brave and Chrome. It runs only when you click it.

## Install

1. Open `brave://extensions` (or `chrome://extensions`).
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this directory.

The toolbar icon opens the popup. Options are on the extension's details page, or from **Options** in the popup.

## What it does

- Capture the visible part of the active tab, with an optional delay.
- Capture a screen or an application window.
- Capture a full page by scrolling and joining the slices.
- Select an area, then capture it or copy it to the clipboard.
- Download, copy, print, or edit a still. The editor can resize, crop, draw, highlight, add shapes, arrows, and text, and blur a zone.
- Record the active tab or the desktop. In the popup you can change the format, size, microphone, and tab sound for that recording; Options keeps the defaults. Sizes are 720p, 1080p, and 4K. Formats are WebM and MP4, with a countdown. If a recording includes sound and this browser cannot store that sound in an MP4 file, that take is saved as WebM.

Full page and selected area need a normal web page. For `brave://`, `chrome://`, the Web Store, and other extension pages, use **Visible part** or **Entire screen**.

## Permissions

`activeTab`, `scripting`, `storage`, `tabCapture`, and `downloads`.

There is no host permission and no content script that stays installed. A script is injected only into the tab you just chose, and the selection overlay is removed when you finish. Captures stay in this browser profile. Nothing is uploaded.

## Shortcuts

Suggested keys, which you can change at `brave://extensions/shortcuts`:

| Action | Suggested key |
| --- | --- |
| Visible part | Alt+Shift+V |
| Full page | Alt+Shift+F |
| Selected area | Alt+Shift+A |
| Record this tab | Alt+Shift+R |

Visible part after a delay, entire screen, and record desktop have commands with no default key.

## Tests

```sh
npm test
```

## Third-party code

`vendor/mp4-muxer.js` is [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.2.2 by Vanilagy, MIT. See `vendor/NOTICE`.
