import { describe, expect, it } from "vitest";
import { DEFAULT_REVISION_ROUNDS, MAX_REVISION_ROUNDS, readRevisionRounds, revisionRoundsFromSetting } from "./revision-rounds";

describe("readRevisionRounds", () => {
  it("reads a whole number from 0 to the maximum, with spaces dropped", () => {
    expect(readRevisionRounds("0")).toEqual({ ok: true, rounds: 0 });
    expect(readRevisionRounds(" 3 ")).toEqual({ ok: true, rounds: 3 });
    expect(readRevisionRounds(String(MAX_REVISION_ROUNDS))).toEqual({ ok: true, rounds: MAX_REVISION_ROUNDS });
  });

  it("refuses anything else", () => {
    for (const typed of ["", " ", "-1", "11", "100", "2.5", "1e1", "two", "+2", "0x2"]) {
      expect(readRevisionRounds(typed)).toEqual({ ok: false });
    }
  });
});

describe("revisionRoundsFromSetting", () => {
  it("is the default when nothing is saved or the saved value cannot be read", () => {
    expect(revisionRoundsFromSetting(null)).toBe(DEFAULT_REVISION_ROUNDS);
    expect(revisionRoundsFromSetting("lots")).toBe(DEFAULT_REVISION_ROUNDS);
    expect(revisionRoundsFromSetting("99")).toBe(DEFAULT_REVISION_ROUNDS);
  });

  it("is the saved number, including 0", () => {
    expect(revisionRoundsFromSetting("0")).toBe(0);
    expect(revisionRoundsFromSetting("5")).toBe(5);
  });
});
