import { describe, expect, it } from "vitest";
import { CHANGELOG_ENTRIES } from "./changelog";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

describe("the changelog", () => {
  it("is newest first", () => {
    const dates = CHANGELOG_ENTRIES.map((entry) => entry.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("writes each date out the same way its machine-readable date says", () => {
    for (const entry of CHANGELOG_ENTRIES) {
      const [year, month, day] = entry.date.split("-").map(Number);
      expect(entry.label).toBe(`${day} ${MONTHS[(month ?? 1) - 1]} ${year}`);
    }
  });

  it("has no em or en dash in anything a customer reads", () => {
    for (const entry of CHANGELOG_ENTRIES) expect(`${entry.label} ${entry.title} ${entry.body}`).not.toMatch(/[\u2014\u2013]/);
  });

  it("does not point at a Feedback item the account menu no longer has", () => {
    for (const entry of CHANGELOG_ENTRIES) expect(entry.body).not.toMatch(/feedback/i);
  });
});
