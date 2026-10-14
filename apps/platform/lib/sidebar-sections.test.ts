import { describe, expect, it } from "vitest";
import { joinSections } from "./sidebar-sections";

const item = (label: string): { readonly href: string; readonly label: string; readonly icon: null } => ({ href: `/${label}`, label, icon: null });

describe("joinSections", () => {
  it("draws a hairline above the first row of every section but the first", () => {
    const rows = joinSections([[item("a"), item("b")], [item("c")], [item("d")]]);
    expect(rows.map((row) => [row.label, row.sectionStart ?? false])).toEqual([
      ["a", false],
      ["b", false],
      ["c", true],
      ["d", true],
    ]);
  });

  it("leaves out a section a customer has nothing in, so no hairline is drawn twice or at the top", () => {
    const rows = joinSections([[], [item("a")], [], [item("b")]]);
    expect(rows.map((row) => [row.label, row.sectionStart ?? false])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });

  it("keeps each row's own fields", () => {
    const rows = joinSections([[{ ...item("a"), count: 3 }]]);
    expect(rows[0]?.count).toBe(3);
  });
});
