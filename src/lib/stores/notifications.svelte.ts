/** How long a notification stays before it goes away on its own. */
export const SHOW_MS = 5000;

/** The one notification on screen, if any. `id` changes with every new one, so it replays its entrance. */
export const notification = $state({ current: null as { id: number; message: string } | null });

let timer: ReturnType<typeof setTimeout> | undefined;
let lastId = 0;

/** Shows a short message in the bottom-right corner. A new one replaces the one already showing. */
export function notify(message: string) {
  clearTimeout(timer);
  notification.current = { id: ++lastId, message };
  timer = setTimeout(dismiss, SHOW_MS);
}

export function dismiss() {
  clearTimeout(timer);
  notification.current = null;
}
