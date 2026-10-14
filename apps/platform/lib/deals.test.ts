import { describe, expect, it } from "vitest";
import { createNotice, dealState, parseDealForm, readDealsNotice } from "./deals";

const TODAY = "2026-10-07";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const GOOD = { title: "20% off your first haircut", badge: "20% off", terms: "Weekdays before 5 pm" };

describe("parseDealForm", () => {
  it("fills in today and two weeks when the dates are left empty", () => {
    expect(parseDealForm(form(GOOD), TODAY)).toEqual({ ok: true, fields: { ...GOOD, startsOn: TODAY, endsOn: "2026-10-20" } });
  });

  it("trims the text and keeps given dates", () => {
    const parsed = parseDealForm(form({ ...GOOD, title: "  Free dessert ", startsOn: "2026-10-10", endsOn: "2026-10-12" }), TODAY);
    expect(parsed).toEqual({ ok: true, fields: { ...GOOD, title: "Free dessert", startsOn: "2026-10-10", endsOn: "2026-10-12" } });
  });

  it("refuses empty or too long text", () => {
    expect(parseDealForm(form({ ...GOOD, title: " " }), TODAY)).toEqual({ ok: false, notice: "invalid" });
    expect(parseDealForm(form({ ...GOOD, badge: "x".repeat(21) }), TODAY)).toEqual({ ok: false, notice: "invalid" });
    expect(parseDealForm(form({ ...GOOD, terms: "x".repeat(91) }), TODAY)).toEqual({ ok: false, notice: "invalid" });
    expect(parseDealForm(new FormData(), TODAY)).toEqual({ ok: false, notice: "invalid" });
  });

  it("refuses bad dates, a reversed range and a range over 90 days", () => {
    expect(parseDealForm(form({ ...GOOD, startsOn: "10/10/2026" }), TODAY)).toEqual({ ok: false, notice: "invalid" });
    expect(parseDealForm(form({ ...GOOD, startsOn: "2026-10-12", endsOn: "2026-10-10" }), TODAY)).toEqual({ ok: false, notice: "invalid" });
    expect(parseDealForm(form({ ...GOOD, startsOn: "2026-10-07", endsOn: "2027-01-05" }), TODAY)).toEqual({ ok: false, notice: "invalid" });
    expect(parseDealForm(form({ ...GOOD, startsOn: "2026-10-07", endsOn: "2027-01-04" }), TODAY).ok).toBe(true);
  });

  it("refuses a deal that is already over", () => {
    expect(parseDealForm(form({ ...GOOD, startsOn: "2026-10-01", endsOn: "2026-10-05" }), TODAY)).toEqual({ ok: false, notice: "in-the-past" });
  });
});

describe("dealState", () => {
  const live = { status: "live" as const, startsOn: "2026-10-07", endsOn: "2026-10-10" };
  it("tells where a deal stands", () => {
    expect(dealState(live, "2026-10-06")).toBe("upcoming");
    expect(dealState(live, "2026-10-07")).toBe("on");
    expect(dealState(live, "2026-10-10")).toBe("on");
    expect(dealState(live, "2026-10-11")).toBe("ended");
    expect(dealState({ ...live, status: "taken_down" }, "2026-10-08")).toBe("taken-down");
  });
});

describe("notices", () => {
  it("reads only known codes", () => {
    expect(readDealsNotice("posted")).toBe("posted");
    expect(readDealsNotice("<script>")).toBeNull();
    expect(readDealsNotice(undefined)).toBeNull();
  });

  it("maps a create's outcome", () => {
    const deal = { id: "x", businessId: "b", title: "t", badge: "b", terms: "t", startsOn: TODAY, endsOn: TODAY, status: "live", takenDownReason: null, createdAt: new Date() } as const;
    expect(createNotice({ kind: "created", deal }, true)).toBe("posted");
    expect(createNotice({ kind: "created", deal }, false)).toBe("posted-waiting");
    expect(createNotice({ kind: "limit" }, true)).toBe("limit");
    expect(createNotice({ kind: "no-claim" }, true)).toBe("no-claim");
  });
});
