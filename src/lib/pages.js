export function pageAllowsScripting(url = "") {
  return /^(https?:|file:)/i.test(url);
}

export const SCRIPT_BLOCKED_MESSAGE = "Full page and selected area need a normal web page. Use Visible part or Entire screen for this tab.";
