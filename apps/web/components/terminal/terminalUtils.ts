/**
 * Utility functions for terminal text processing, clipboard copying, and keyboard shortcuts.
 */

/**
 * Returns true when a KeyboardEvent matches the Ctrl+J / Cmd+J shortcut
 * used to toggle/expand the terminal panel.
 */
export function isTerminalToggleShortcut(
  event: Pick<
    KeyboardEvent,
    "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "key" | "code"
  >,
): boolean {
  const isCtrlOrCmd = event.ctrlKey || event.metaKey;
  if (!isCtrlOrCmd || event.altKey || event.shiftKey) return false;
  return event.key === "j" || event.key === "J" || event.code === "KeyJ";
}

/**
 * Strips ANSI escape sequences, terminal control characters, and orphaned CSI codes
 * from terminal output while preserving spaces, tabs, and newlines.
 */
export function cleanTerminalText(text: string): string {
  if (!text) return "";

  return (
    text
      // 1. Normalize CRLF to LF
      .replace(/\r\n/g, "\n")
      // 2. Strip standard ANSI / VT100 / xterm escape sequences (with ESC byte: \x1b, \u001b, \u009b)
      .replace(
        /(?:\x1b|\u001b|\u009b)(?:\[[0-9:;<=>?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\|$)|[PX^_][^\x1b]*(?:\x07|\x1b\\|$)|[\(\)\*#%+-./][0-9A-Za-z]|[@-Z\\-_c])/g,
        "",
      )
      // 3. Strip orphaned / naked ANSI escape codes (missing the ESC byte)
      .replace(/\[[0-2]?[KJ]/g, "") // Clear line / display: [K, [0K, [2K, [J, etc.
      .replace(/\[(?:\d+(?:;\d+)*)?m/g, "") // SGR styling: [m, [0m, [1;31m, [41;97m, etc.
      .replace(/\[\?[0-9]+[a-zA-Z]/g, "") // Private modes: [?25h, [?25l, etc.
      .replace(/\[\d+(?:;\d+)*[a-zA-Z]/g, "") // Cursor positioning: [1G, [2A, [10;20H, etc.
      // 4. Strip non-printable ASCII control characters except tab (\t) and newline (\n)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
      // 5. Normalize standalone carriage returns
      .replace(/\r/g, "\n")
  );
}

/**
 * Copies text to the user's system clipboard with robust fallback support
 * for modern navigator.clipboard and document.execCommand('copy').
 * ANSI styling codes and control characters are stripped cleanly before copying.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  const clean = cleanTerminalText(text);
  if (!clean) return false;

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(clean);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard.writeText failed, attempting execCommand fallback:", err);
  }

  try {
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = clean;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      return successful;
    }
  } catch (fallbackErr) {
    console.error("execCommand fallback failed:", fallbackErr);
  }

  return false;
}
