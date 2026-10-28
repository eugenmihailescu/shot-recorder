import assert from "node:assert/strict";
import test from "node:test";
import { strokeAlpha, strokeOpacity } from "../src/editor/tools.js";

test("missing stroke opacity stays solid, and a highlight stays at 40 percent", () => {
  assert.equal(strokeOpacity({ type: "rect" }), 100);
  assert.equal(strokeAlpha({ type: "rect" }), 1);
  assert.equal(strokeOpacity({ type: "highlight" }), 40);
  assert.equal(strokeAlpha({ type: "highlight" }), 0.4);
});

test("stroke opacity is clamped to the 0–100 range", () => {
  assert.equal(strokeOpacity({ type: "pen", opacity: 25 }), 25);
  assert.equal(strokeAlpha({ type: "ellipse", opacity: 25 }), 0.25);
  assert.equal(strokeOpacity({ type: "arrow", opacity: 180 }), 100);
  assert.equal(strokeOpacity({ type: "highlight", opacity: -4 }), 0);
  assert.equal(strokeAlpha({ type: "rect", opacity: 0 }), 0);
});
