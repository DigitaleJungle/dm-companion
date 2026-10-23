import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Character } from "$lib/api/characters";

// The sheet saves through saveCharacter; here it's a mock that each test controls. `saved` holds each saved
// character as it was at the call (the real call sends it as JSON right away).
const saveCharacter = vi.fn();
const saved: Character[] = [];
vi.mock("$lib/api/characters", () => ({
  saveCharacter: (...args: unknown[]) => {
    saved.push(JSON.parse(JSON.stringify(args[2])));
    return saveCharacter(...args);
  },
  getCharacter: vi.fn(),
}));

const { Sheet } = await import("./sheet.svelte");

const thalia = (): Character => ({ id: "c1", name: "Thalia", classes: [{ name: "Fighter", source: "XPHB", level: 1 }], hp: { max: 12, current: 12 } });

function sheet() {
  const s = new Sheet(null, "c1");
  s.character = thalia();
  return s;
}

describe("autosave", () => {
  beforeEach(() => {
    saveCharacter.mockReset();
    saved.length = 0;
  });

  it("a change made while a save runs is saved next, with the newest state", async () => {
    let finish!: () => void;
    saveCharacter.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve))).mockResolvedValue(undefined);
    const s = sheet();
    s.change((c) => (c.hp!.current = 10));
    const first = s.flush();
    await Promise.resolve();
    s.change((c) => (c.hp!.current = 7)); // during the first save
    finish();
    await first;
    await s.flush();
    expect(saved.map((c) => c.hp?.current)).toEqual([10, 7]);
    expect(s.save.status).toBe("saved");
  });

  it("a failed save keeps the change until Retry saves it", async () => {
    saveCharacter.mockRejectedValueOnce({ kind: "io", message: "disk full" }).mockResolvedValue(undefined);
    const s = sheet();
    s.change((c) => (c.hp!.current = 3));
    await s.flush();
    expect(s.save.status).toBe("error");
    await s.retry();
    expect(saveCharacter).toHaveBeenCalledTimes(2);
    expect(saved[1].hp?.current).toBe(3);
    expect(s.save.status).toBe("saved");
  });

  it("nothing changed: nothing is saved", async () => {
    const s = sheet();
    await s.flush();
    expect(saveCharacter).not.toHaveBeenCalled();
  });
});
