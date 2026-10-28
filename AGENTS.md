# Shot Recorder

Screenshot and screen recording for Chrome and Brave. Manifest V3, plain JavaScript ES modules, no bundler and no framework. Minimum Chrome 116.

## Commands

- `npm test` — `node --test`. Run after changing logic, the manifest, or a path the tests check. There is no build, lint, or format script. Install by loading this directory unpacked.

## Where things live

There is no `docs/` directory. Do not search for one. Read `README.md` only for install steps, the permission story, or the shortcut table.

- `manifest.json` — permissions, commands, and entry pages.
- `src/background/service-worker.js` — messages, keyboard commands, and capture orchestration.
- `src/popup/` — toolbar popup.
- `src/options/` — options page.
- `src/capture/` — desktop still picker (`screen.html`), stitch planner (`stitch.js`), injected full-page script (`full-page.js`).
- `src/overlay/overlay.js` — injected region selector.
- `src/editor/` — still editor.
- `src/record/` — recorder, MP4 path, and on-top controls.
- `src/save/` — download-only still page.
- `src/message/` — error popup.
- `src/lib/` — settings, IndexedDB captures, filenames, geometry, downloads, share-window sizes, capture quota, and the page allowlist.
- `test/` — `node:test` files.
- `vendor/mp4-muxer.js` — vendored mp4-muxer 5.2.2. See `vendor/NOTICE`.

## Rules

Observed:

- On click only. Permissions stay `activeTab`, `scripting`, `storage`, `tabCapture`, and `downloads`. No `host_permissions` and no `content_scripts` (`manifest.json`, `test/manifest.test.js`).
- Inject `src/capture/full-page.js` or `src/overlay/overlay.js` only into the tab the user just chose (`src/background/service-worker.js`). Those two files are classic IIFEs: no `import` or `export`, a one-shot global guard, a shadow-DOM UI, and `chrome.runtime.connect` (`region` or `fullpage`).
- Script only `http:`, `https:`, and `file:` pages (`src/lib/pages.js`). Other URLs use a visible-tab or desktop capture.
- Extension pages and the service worker are ES modules. Import paths include the `.js` suffix.
- Run every stored settings object through `normalizeSettings`. Settings live in `chrome.storage.local` under `settings` (`src/lib/settings.js`).
- Stills live in IndexedDB `shot-recorder` / `captures`, keyed by `id`, and are opened by that id. Default retention is two days (`src/lib/db.js`, `src/lib/present.js`). Nothing is uploaded. There is no `fetch`.
- Space visible-tab captures with `planCaptureSlot` (600 ms) and retry once on `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND` (`src/lib/capture-quota.js`). Full-page limits are 40 slices, 30000 CSS px, and 16384 device px, and only one full-page capture runs at a time (`src/capture/stitch.js`, `src/background/service-worker.js`).
- Do not edit `vendor/mp4-muxer.js` in place. Replace the file and update `vendor/NOTICE` when bumping it. If audio cannot go in an MP4 file, save WebM (`src/record/mp4.js`).
- Tests use `node:test` and `node:assert/strict` and import pure functions. Keep `chrome.*` inside functions so those modules still load under Node. `test/files.test.js` requires the manifest pages, icons, injected scripts, and the vendor file to exist.

Proposed (not written down in the repo; the package has no dependencies and no browser test runner):

- Ask before adding a dependency.
- Do not refactor unrelated code in the same change. The permission and path tests fail if those move.
- Done means `npm test` passes. UI changes still need a reload of the unpacked extension.
