import { describe, expect, it } from "vitest";
import { AVATAR_TONES, avatarInitials, avatarTone } from "./avatar";

describe("avatarInitials", () => {
  it("takes the first and last word", () => {
    expect(avatarInitials("Oak & Iron Barbers")).toBe("OB");
  });

  it("uses a single initial for a one-word name", () => {
    expect(avatarInitials("Kettle")).toBe("K");
  });

  it("never returns an empty circle", () => {
    expect(avatarInitials("   ")).not.toBe("");
  });
});

describe("avatarTone", () => {
  it("gives the same tone for the same id every time", () => {
    const id = "01a0cdd5-aeea-771c-8d69-6389f67992ec";
    expect(avatarTone(id)).toEqual(avatarTone(id));
  });

  it("always returns one of the palette's tones", () => {
    for (const id of ["a", "b", "01a0ce35-5c9f-7f70-82a0-0cb5a403a07c", ""]) {
      expect(AVATAR_TONES).toContainEqual(avatarTone(id));
    }
  });

  it("spreads ids across the palette rather than bunching on one colour", () => {
    const ids = Array.from({ length: 50 }, (_, index) => `01a0cdd5-aeea-771c-8d69-${String(index).padStart(12, "0")}`);
    const used = new Set(ids.map((id) => avatarTone(id).background));
    expect(used.size).toBeGreaterThanOrEqual(5);
  });
});
