import { describe, expect, it } from "vitest";
import { BREACH_DATA_CATEGORIES, parseBreachForm, parseBreachProgress } from "./breach-form";

const NOW = new Date("2026-10-12T12:00:00.000Z");

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseBreachForm", () => {
  it("reads what happened, when it was found (as India time) and the kinds of data involved", () => {
    const parsed = parseBreachForm(form([["summary", "  A lost laptop.  "], ["detectedAt", "2026-10-12T10:30"], ["category", "contact details"], ["category", "billing details"]]), NOW);
    expect(parsed).toEqual({
      ok: true,
      input: { summary: "A lost laptop.", detectedAt: new Date("2026-10-12T05:00:00.000Z"), dataCategories: ["contact details", "billing details"] },
    });
  });

  it("asks for a summary, a real time that is not in the future, and ignores a category it does not know", () => {
    expect(parseBreachForm(form([["summary", "   "], ["detectedAt", "2026-10-12T10:30"]]), NOW)).toEqual({ ok: false, message: "Say what happened, in a few words." });
    expect(parseBreachForm(form([["summary", "x"], ["detectedAt", "not a time"]]), NOW)).toEqual({ ok: false, message: "Enter when the breach was found." });
    expect(parseBreachForm(form([["summary", "x"], ["detectedAt", "2026-10-13T10:30"]]), NOW)).toEqual({ ok: false, message: "A breach cannot have been found in the future." });
    const parsed = parseBreachForm(form([["summary", "x"], ["detectedAt", "2026-10-12T10:30"], ["category", "everything"], ["category", "health information"]]), NOW);
    expect(parsed).toMatchObject({ ok: true, input: { dataCategories: ["health information"] } });
  });

  it("refuses a summary over 2000 characters", () => {
    expect(parseBreachForm(form([["summary", "x".repeat(2001)], ["detectedAt", "2026-10-12T10:30"]]), NOW)).toEqual({ ok: false, message: "Keep the summary to 2000 characters." });
  });

  it("offers a fixed list of kinds of data", () => {
    expect(BREACH_DATA_CATEGORIES).toContain("health information");
    expect(BREACH_DATA_CATEGORIES).toContain("contact details");
  });
});

describe("parseBreachProgress", () => {
  it("turns a button into the progress it records, stamped with the time it was pressed", () => {
    expect(parseBreachProgress(form([["do", "cert_in"]]), NOW)).toEqual({ ok: true, progress: { reportedCertInAt: NOW } });
    expect(parseBreachProgress(form([["do", "board"]]), NOW)).toEqual({ ok: true, progress: { reportedBoardAt: NOW } });
    expect(parseBreachProgress(form([["do", "people"]]), NOW)).toEqual({ ok: true, progress: { peopleNotifiedAt: NOW } });
    expect(parseBreachProgress(form([["do", "contained"]]), NOW)).toEqual({ ok: true, progress: { status: "contained" } });
    expect(parseBreachProgress(form([["do", "closed"]]), NOW)).toEqual({ ok: true, progress: { status: "closed" } });
  });

  it("refuses anything else", () => {
    expect(parseBreachProgress(form([["do", "delete"]]), NOW)).toEqual({ ok: false });
    expect(parseBreachProgress(form([]), NOW)).toEqual({ ok: false });
  });
});
