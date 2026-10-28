import assert from "node:assert/strict";
import test from "node:test";
import { textBackgroundColor } from "../src/editor/tools.js";

test("text background is transparent at zero opacity", () => {
  assert.equal(textBackgroundColor({ bg: "#000000", bgOpacity: 0 }), "");
  assert.equal(textBackgroundColor({ bg: "#000000", bgOpacity: 40 }), "rgba(0, 0, 0, 0.4)");
  assert.equal(textBackgroundColor({ bg: "transparent", bgOpacity: 50 }), "rgba(255, 255, 255, 0.5)");
  assert.equal(textBackgroundColor({ bg: "#112233" }), "#112233");
});
