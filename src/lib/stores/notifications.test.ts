import { afterEach, describe, expect, it, vi } from "vitest";
import { SHOW_MS, dismiss, notification, notify } from "./notifications.svelte";

describe("notifications", () => {
  afterEach(() => {
    dismiss();
    vi.useRealTimers();
  });

  it("shows one at a time: a new one replaces the old", () => {
    notify("Saved");
    const first = notification.current!.id;
    notify("Copied");
    expect(notification.current?.message).toBe("Copied");
    expect(notification.current!.id).not.toBe(first);
  });

  it("goes away on its own, counted from the latest one", () => {
    vi.useFakeTimers();
    notify("One");
    vi.advanceTimersByTime(SHOW_MS - 100);
    notify("Two");
    vi.advanceTimersByTime(200);
    expect(notification.current?.message).toBe("Two");
    vi.advanceTimersByTime(SHOW_MS);
    expect(notification.current).toBeNull();
  });

  it("can be dismissed", () => {
    notify("Hello");
    dismiss();
    expect(notification.current).toBeNull();
  });
});
