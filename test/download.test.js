import assert from "node:assert/strict";
import test from "node:test";
import { blobFromDataUrl, dataUrlFromBytes } from "../src/lib/download.js";

test("png bytes survive a data URL", async () => {
  const bytes = new Uint8Array(9000);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
  const blob = blobFromDataUrl(dataUrlFromBytes(bytes));
  assert.equal(blob.type, "image/png");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});
