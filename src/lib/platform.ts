export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Shortcut label with the platform's modifier, e.g. "Ctrl K" or "⌘ K". */
export function modKey(key: string): string {
  return `${isMac ? "⌘" : "Ctrl"} ${key}`;
}
