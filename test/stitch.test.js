import assert from "node:assert/strict";
import test from "node:test";
import { maxCaptureCssHeight, planDocumentBands } from "../src/capture/stitch.js";

test("plans a short page as one band", () => {
  const plan = planDocumentBands(800, 1000);
  assert.deepEqual(plan.bands, [{ scrollTop: 0, srcY: 0, srcH: 800, destY: 0 }]);
  assert.equal(plan.covered, 800);
  assert.equal(plan.truncated, false);
});

test("plans the partial last viewport of a long page", () => {
  const plan = planDocumentBands(4500, 1000);
  assert.deepEqual(
    plan.bands.map((band) => [band.scrollTop, band.srcY, band.srcH, band.destY]),
    [
      [0, 0, 1000, 0],
      [1000, 0, 1000, 1000],
      [2000, 0, 1000, 2000],
      [3000, 0, 1000, 3000],
      [3500, 500, 500, 4000],
    ],
  );
  assert.equal(plan.covered, 4500);
  assert.equal(plan.truncated, false);
});

test("marks a capture truncated when the slice cap is hit", () => {
  const plan = planDocumentBands(100000, 1000, 30000, 2);
  assert.equal(plan.bands.length, 2);
  assert.equal(plan.covered, 2000);
  assert.equal(plan.truncated, true);
});

test("caps device pixels on a high density screen", () => {
  assert.equal(maxCaptureCssHeight(2, 800), 8192);
  assert.equal(maxCaptureCssHeight(1, 900), 16384);
});
