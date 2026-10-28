import { describe, expect, it } from "vitest";
import { canMoveReport, REPORT_SERVICES, REPORT_SOURCES, REPORT_STATES, type ReportState } from "./report-states";

describe("report states", () => {
  it("lists the services, sources and states the database checks accept", () => {
    expect(REPORT_SERVICES).toEqual(["website", "social", "search"]);
    expect(REPORT_SOURCES).toEqual(["own", "gsc", "ga4"]);
    expect(REPORT_STATES).toEqual(["draft", "held", "approved", "sent"]);
  });

  it("allows exactly the arrows the guard trigger allows", () => {
    const allowed: readonly (readonly [ReportState, ReportState])[] = [
      ["draft", "held"],
      ["draft", "approved"],
      ["held", "draft"],
      ["held", "approved"],
      ["approved", "held"],
      ["approved", "sent"],
    ];
    for (const from of REPORT_STATES) {
      for (const to of REPORT_STATES) {
        const expected = from === to || allowed.some(([a, b]) => a === from && b === to);
        expect(canMoveReport(from, to), `${from} to ${to}`).toBe(expected);
      }
    }
  });

  it("never leaves sent", () => {
    for (const to of REPORT_STATES) if (to !== "sent") expect(canMoveReport("sent", to)).toBe(false);
  });
});
