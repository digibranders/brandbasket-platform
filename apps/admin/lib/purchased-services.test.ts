import type { AddOnSubscription, BundledAddOn } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { isWebsiteBoughtFrom } from "./purchased-services";

type Plan = Pick<BundledAddOn, "addOn" | "status" | "endRequestedAt">;
type Later = Pick<AddOnSubscription, "addOn" | "status">;

const plan = (addOn: Plan["addOn"], status: Plan["status"], endRequestedAt: Date | null = null): Plan => ({ addOn, status, endRequestedAt });
const later = (addOn: Later["addOn"], status: Later["status"]): Later => ({ addOn, status });

describe("isWebsiteBoughtFrom", () => {
  it("is false for a business with no add-ons", () => {
    expect(isWebsiteBoughtFrom([], [])).toBe(false);
  });

  it("is false for a Social-only or Search-only business", () => {
    const social: Plan[] = [plan("digital-growth", "active")];
    const search: Plan[] = [plan("local-seo-aeo", "pending")];
    expect(isWebsiteBoughtFrom(social, [])).toBe(false);
    expect(isWebsiteBoughtFrom(search, [later("digital-growth", "active")])).toBe(false);
  });

  it("is true for a plan line that is pending or active", () => {
    expect(isWebsiteBoughtFrom([plan("managed-website", "active")], [])).toBe(true);
    expect(isWebsiteBoughtFrom([plan("managed-website", "pending")], [])).toBe(true);
  });

  it("is false for a plan line that is removed or has an end requested", () => {
    expect(isWebsiteBoughtFrom([plan("managed-website", "removed")], [])).toBe(false);
    expect(isWebsiteBoughtFrom([plan("managed-website", "active", new Date("2026-11-01T00:00:00.000Z"))], [])).toBe(false);
  });

  it("is true for a website bought later while its subscription is scheduled, active or past due", () => {
    for (const status of ["scheduled", "active", "past_due"] as const) {
      expect(isWebsiteBoughtFrom([], [later("managed-website", status)])).toBe(true);
    }
  });

  it("is false for a later website add that is incomplete, halted or cancelled", () => {
    for (const status of ["incomplete", "halted", "cancelled"] as const) {
      expect(isWebsiteBoughtFrom([], [later("managed-website", status)])).toBe(false);
    }
  });
});
