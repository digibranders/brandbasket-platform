import type { ClientBilling, ClientProject } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { CLIENT_ROW_STAGE_LABELS, clientRowStage, servicesByBusiness } from "./client-rows";

const PAID: ClientBilling = {
  subscription: null,
  firstPayment: { amountCents: 299_900, currency: "INR", provider: "fake", paidAt: new Date("2026-11-17T09:00:00.000Z"), manual: null },
};
const NOT_PAID: ClientBilling = { subscription: null, firstPayment: null };

function project(status: ClientProject["status"]): ClientProject {
  return {
    id: "01a0f71b-8402-7d48-a90a-207e8c8a0001",
    status,
    onboardingSubmittedAt: null,
    slaDueAt: null,
    previewUrl: null,
    previewSentAt: null,
    revisionRoundsGranted: 0,
    launchedAt: null,
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
  };
}

describe("clientRowStage", () => {
  it("puts leaving first, then not paid, then the build stage", () => {
    expect(clientRowStage({ project: project("live"), billing: PAID }, true)).toBe("leaving");
    expect(clientRowStage({ project: project("onboarding"), billing: NOT_PAID }, false)).toBe("not-paid");
    expect(clientRowStage({ project: null, billing: PAID }, false)).toBe("setup");
    expect(clientRowStage({ project: project("live"), billing: PAID }, false)).toBe("live");
  });

  it("has a label for every stage", () => {
    expect(CLIENT_ROW_STAGE_LABELS["not-paid"]).toBe("Not paid");
    expect(CLIENT_ROW_STAGE_LABELS.leaving).toBe("Leaving");
  });
});

describe("servicesByBusiness", () => {
  it("lists each business's services in catalogue order and adds up only active lines as the monthly amount", () => {
    const map = servicesByBusiness([
      { businessId: "a", addOn: "local-seo-aeo", netAmountCents: 2_499_900, status: "active" },
      { businessId: "a", addOn: "managed-website", netAmountCents: 299_900, status: "active" },
      { businessId: "a", addOn: "digital-growth", netAmountCents: 999_900, status: "pending" },
      { businessId: "b", addOn: "managed-website", netAmountCents: 299_900, status: "pending" },
    ]);
    expect(map.get("a")).toEqual({ addOns: ["managed-website", "digital-growth", "local-seo-aeo"], monthlyCents: 2_799_800 });
    expect(map.get("b")).toEqual({ addOns: ["managed-website"], monthlyCents: 0 });
    expect(map.get("c")).toBeUndefined();
  });
});
