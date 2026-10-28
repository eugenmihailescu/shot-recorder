import assert from "node:assert/strict";
import test from "node:test";
import { commandLabel, editorCommand } from "../src/editor/keys.js";

const key = (name, extra = {}) => ({
  key: name,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  repeat: false,
  ...extra,
});

test("undo, redo, and erase use the editor shortcuts", () => {
  assert.equal(editorCommand(key("z", { ctrlKey: true })), "undo");
  assert.equal(editorCommand(key("Z", { metaKey: true })), "undo");
  assert.equal(editorCommand(key("z", { ctrlKey: true, shiftKey: true })), "redo");
  assert.equal(editorCommand(key("Z", { metaKey: true, shiftKey: true })), "redo");
  assert.equal(editorCommand(key("y", { ctrlKey: true })), "redo");
  assert.equal(editorCommand(key("y", { metaKey: true })), "redo");
  assert.equal(editorCommand(key("e")), "erase");
  assert.equal(editorCommand(key("E")), "erase");
  assert.equal(editorCommand(key("Delete")), "delete");
  assert.equal(editorCommand(key("Backspace")), "delete");
});

test("editor shortcuts ignore plain letters and modified erase keys", () => {
  assert.equal(editorCommand(key("z")), "");
  assert.equal(editorCommand(key("y")), "");
  assert.equal(editorCommand(key("e", { ctrlKey: true })), "");
  assert.equal(editorCommand(key("e", { metaKey: true })), "");
  assert.equal(editorCommand(key("e", { altKey: true })), "");
  assert.equal(editorCommand(key("e", { shiftKey: true })), "");
  assert.equal(editorCommand(key("e", { repeat: true })), "");
  assert.equal(editorCommand(key("y", { ctrlKey: true, shiftKey: true })), "");
  assert.equal(editorCommand(key("z", { ctrlKey: true, altKey: true })), "");
  assert.equal(editorCommand(key("Delete", { ctrlKey: true })), "");
  assert.equal(editorCommand(key("Backspace", { metaKey: true })), "");
  assert.equal(commandLabel("download"), "");
  assert.equal(commandLabel("undo"), "Ctrl+Z");
  assert.equal(commandLabel("redo"), "Ctrl+Shift+Z");
  assert.equal(commandLabel("erase"), "E");
  assert.equal(commandLabel("undo", true), "Cmd+Z");
  assert.equal(commandLabel("redo", true), "Cmd+Shift+Z");
});
