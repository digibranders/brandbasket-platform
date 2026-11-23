import { describe, expect, it } from "vitest";
import { silentDaysSince, stepperIndex, websiteStage, type WebsiteStage, type WebsiteStageFacts } from "./website-stage";

const BASE: WebsiteStageFacts = { status: "building", kickoffUnconfirmed: false, late: false, silentDays: null, silentThreshold: 5, domainStatus: null, moveAsked: false };
const stage = (extra: Partial<WebsiteStageFacts>): WebsiteStage => websiteStage({ ...BASE, ...extra });

describe("websiteStage", () => {
  it("tells all 14 states apart", () => {
    const seen = new Set<WebsiteStage>([
      stage({ status: "onboarding" }),
      stage({ status: "onboarding", kickoffUnconfirmed: true }),
      stage({ status: "submitted" }),
      stage({ status: "building" }),
      stage({ status: "building", late: true }),
      stage({ status: "preview", silentDays: 1 }),
      stage({ status: "preview", silentDays: 5 }),
      stage({ status: "revisions" }),
      stage({ status: "approved" }),
      stage({ status: "approved", domainStatus: "misconfigured" }),
      stage({ status: "live" }),
      stage({ status: "live", moveAsked: true }),
      stage({ status: "on_hold" }),
      stage({ status: "cancelled" }),
    ]);
    expect(seen.size).toBe(14);
  });

  it("treats a degraded address like a failing one, and a pending one as fine", () => {
    expect(stage({ status: "approved", domainStatus: "degraded" })).toBe("address_error");
    expect(stage({ status: "approved", domainStatus: "pending" })).toBe("approved");
  });

  it("ignores late and silence outside their own stage", () => {
    expect(stage({ status: "submitted", late: true })).toBe("ready");
    expect(stage({ status: "building", silentDays: 9 })).toBe("building");
  });
});

describe("stepperIndex", () => {
  it("moves forward with the build and is complete once live", () => {
    expect(stepperIndex("waiting")).toBe(0);
    expect(stepperIndex("building")).toBe(1);
    expect(stepperIndex("changes")).toBe(2);
    expect(stepperIndex("address_error")).toBe(3);
    expect(stepperIndex("move")).toBe(5);
  });

  it("claims no current step for a build on hold or cancelled", () => {
    expect(stepperIndex("hold")).toBeNull();
    expect(stepperIndex("cancelled")).toBeNull();
  });
});

describe("silentDaysSince", () => {
  it("counts whole days and says nothing without a sent preview", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(silentDaysSince(new Date("2026-11-15T11:00:00Z"), now)).toBe(5);
    expect(silentDaysSince(null, now)).toBeNull();
  });
});
