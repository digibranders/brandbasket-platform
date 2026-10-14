import { describe, expect, it } from "vitest";
import { appointmentCountsLine } from "./appointment-counts";

describe("appointmentCountsLine", () => {
  it("joins upcoming, total and doctors", () => {
    expect(appointmentCountsLine({ upcoming: 3, total: 12, doctors: 4 })).toBe("3 upcoming · 12 total · 4 doctors");
  });

  it("says doctor, not doctors, for exactly one", () => {
    expect(appointmentCountsLine({ upcoming: 0, total: 0, doctors: 1 })).toBe("0 upcoming · 0 total · 1 doctor");
  });

  it("pluralises zero doctors", () => {
    expect(appointmentCountsLine({ upcoming: 0, total: 0, doctors: 0 })).toBe("0 upcoming · 0 total · 0 doctors");
  });
});
