export function editorCommand(event) {
  const key = String(event.key || "").toLowerCase();
  const mod = Boolean(event.ctrlKey || event.metaKey);
  if (event.altKey) return "";
  if (mod && key === "z") return event.shiftKey ? "redo" : "undo";
  if (mod && !event.shiftKey && key === "y") return "redo";
  if (!mod && !event.shiftKey && !event.repeat && key === "e") return "erase";
  if (!mod && !event.shiftKey && (key === "delete" || key === "backspace")) return "delete";
  return "";
}

export function commandLabel(command, apple = false) {
  const mod = apple ? "Cmd" : "Ctrl";
  if (command === "undo") return `${mod}+Z`;
  if (command === "redo") return `${mod}+Shift+Z`;
  if (command === "erase") return "E";
  return "";
}
