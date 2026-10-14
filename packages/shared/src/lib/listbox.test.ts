import { describe, expect, it } from "vitest";
import { matchTypeahead, moveActive } from "./listbox";

const LABELS = ["Restaurant, café or bakery", "Salon, spa or barber", "School, coaching or training", "Something else"];

describe("moveActive", () => {
  it("steps up and down, stopping at the ends", () => {
    expect(moveActive(1, "next", 4)).toBe(2);
    expect(moveActive(3, "next", 4)).toBe(3);
    expect(moveActive(1, "previous", 4)).toBe(0);
    expect(moveActive(0, "previous", 4)).toBe(0);
  });

  it("jumps to the first and last options", () => {
    expect(moveActive(2, "first", 4)).toBe(0);
    expect(moveActive(0, "last", 4)).toBe(3);
  });

  it("starts from the top or bottom when nothing is active yet", () => {
    expect(moveActive(-1, "next", 4)).toBe(0);
    expect(moveActive(-1, "previous", 4)).toBe(3);
  });

  it("has nowhere to go in an empty list", () => {
    expect(moveActive(-1, "next", 0)).toBe(-1);
  });
});

describe("matchTypeahead", () => {
  it("finds the first option starting with what was typed, ignoring case", () => {
    expect(matchTypeahead(LABELS, "s", -1)).toBe(1);
    expect(matchTypeahead(LABELS, "sc", -1)).toBe(2);
    expect(matchTypeahead(LABELS, "R", 3)).toBe(0);
  });

  it("cycles through options with the same first letter when the same key is pressed again", () => {
    expect(matchTypeahead(LABELS, "s", 1)).toBe(2);
    expect(matchTypeahead(LABELS, "s", 2)).toBe(3);
    expect(matchTypeahead(LABELS, "ss", 3)).toBe(1);
  });

  it("gives no match when nothing starts with the typed text", () => {
    expect(matchTypeahead(LABELS, "z", 0)).toBe(-1);
    expect(matchTypeahead(LABELS, "", 0)).toBe(-1);
  });
});
