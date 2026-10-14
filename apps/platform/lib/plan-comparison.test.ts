import { describe, expect, it } from "vitest";
import { BRANDS } from "./brand";
import { cellWords, COMPARISON_COLUMNS, COMPARISON_ROWS, comparisonRowsFor, planListFor } from "./plan-comparison";

describe("COMPARISON_ROWS", () => {
  it("is the sixteen rows of the Free / Care / Premium table, in order", () => {
    expect(COMPARISON_ROWS.map((row) => row.label)).toEqual([
      "Firstfold business listing",
      "Images",
      "Videos",
      "Competitor ads on your listing",
      "Firstfold business listing management",
      "Next.js business website",
      "Website management",
      "OyeChats professional chatbot",
      "Server and hosting",
      "Appointment management system",
      "Homepage featured placement",
      "Better listing ranking",
      "Google Business Profile management",
      "Facebook account management",
      "Instagram account management",
      "Firstfold digital marketing services",
    ]);
  });

  it("has a unique id for every row", () => {
    expect(new Set(COMPARISON_ROWS.map((row) => row.id)).size).toBe(COMPARISON_ROWS.length);
  });

  it("says competitor ads are allowed on Free and Care, and not on Premium", () => {
    const row = COMPARISON_ROWS.find((r) => r.id === "competitor-ads");
    expect([row?.free, row?.care, row?.premium]).toEqual(["Allowed", "Allowed", "Not allowed"]);
  });
});

describe("cellWords", () => {
  const listing = COMPARISON_ROWS[0];
  const videos = COMPARISON_ROWS[2];
  const featured = COMPARISON_ROWS.find((r) => r.id === "featured");

  it("gives a ticked cell a word a screen reader can read", () => {
    expect(listing && cellWords(listing, "free")).toBe("Included");
  });

  it("gives an empty cell a word too", () => {
    expect(videos && cellWords(videos, "care")).toBe("Not included");
  });

  it("reads a cell that carries text as written", () => {
    expect(featured && cellWords(featured, "premium")).toBe("Hot & Growing");
  });
});

describe("COMPARISON_COLUMNS", () => {
  it("names the three plans, Premium last", () => {
    expect(COMPARISON_COLUMNS.map((column) => column.name)).toEqual(["Free", "Care", "Premium"]);
  });
});

describe("planListFor", () => {
  it("lists what Care includes: its ticked rows and nothing it only gets as text", () => {
    expect(planListFor("care")).toEqual([
      "Firstfold business listing",
      "Images",
      "Next.js business website",
      "Website management",
      "OyeChats professional chatbot",
      "Server and hosting",
    ]);
  });

  it("lists what Premium includes, saying the text rows as sentences", () => {
    const list = planListFor("premium");
    expect(list).toHaveLength(16);
    expect(list).toContain("No competitor ads on your listing");
    expect(list).toContain("Homepage featured placement: Hot & Growing");
    expect(list).toContain("10% off Firstfold digital marketing services");
    expect(list).not.toContain("Competitor ads on your listing");
  });
});

describe("the table under Fynix", () => {
  it("is Firstfold's very table under Firstfold", () => {
    expect(comparisonRowsFor(BRANDS.firstfold)).toBe(COMPARISON_ROWS);
  });

  it("leaves out every row about the directory listing, which Fynix does not sell, and keeps the rest in order", () => {
    const ids = comparisonRowsFor(BRANDS.fynix).map((row) => row.id);
    for (const hidden of ["listing", "images", "videos", "competitor-ads", "listing-management", "featured", "ranking"]) {
      expect(ids).not.toContain(hidden);
    }
    expect(ids).toEqual(COMPARISON_ROWS.map((row) => row.id).filter((id) => ids.includes(id)));
    expect(ids).toContain("website");
    expect(ids).toContain("appointments");
  });

  it("words the marketing row without Firstfold's name", () => {
    const labels = comparisonRowsFor(BRANDS.fynix).map((row) => row.label);
    expect(labels).toContain("Digital marketing services");
    for (const label of labels) expect(label).not.toMatch(/first\s?fold/i);
  });

  it("lists plans to a Fynix customer with no mention of Firstfold", () => {
    const lists = [planListFor("care", BRANDS.fynix), planListFor("premium", BRANDS.fynix)];
    expect(lists[1]).toContain("10% off digital marketing services");
    for (const line of lists.flat()) expect(line).not.toMatch(/first\s?fold/i);
  });
});
