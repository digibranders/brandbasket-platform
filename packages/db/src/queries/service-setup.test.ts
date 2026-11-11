import { describe, expect, it } from "vitest";
import { boughtSetupServicesFrom } from "./service-setup";

const bundled = (addOn: string, status: string, endRequestedAt: Date | null = null) => ({ addOn, status, endRequestedAt }) as never;
const sub = (addOn: string, status: string) => ({ addOn, status }) as never;

describe("boughtSetupServicesFrom", () => {
  it("counts nothing for a business with no add-ons", () => {
    expect(boughtSetupServicesFrom([], [])).toEqual([]);
  });

  it("sets up Social Media and Paid Ads Management in the Social area, once", () => {
    expect(boughtSetupServicesFrom([bundled("paid-ads", "active"), bundled("social-media", "pending")], [])).toEqual(["social"]);
    expect(boughtSetupServicesFrom([bundled("paid-ads", "active")], [])).toEqual(["social"]);
  });

  it("counts a paid add-on subscription that is active, scheduled or past due", () => {
    for (const status of ["active", "scheduled", "past_due"]) {
      expect(boughtSetupServicesFrom([], [sub("social-media", status)])).toEqual(["social"]);
    }
  });

  it("ignores add-ons that are removed, unpaid, halted or cancelled", () => {
    expect(
      boughtSetupServicesFrom(
        [bundled("social-media", "removed")],
        [sub("paid-ads", "incomplete"), sub("paid-ads", "halted"), sub("social-media", "cancelled")],
      ),
    ).toEqual([]);
  });

  it("ignores a bundled add-on whose end is already requested", () => {
    expect(boughtSetupServicesFrom([bundled("social-media", "active", new Date())], [])).toEqual([]);
  });

  it("ignores the managed website and lists a service once when it is bought two ways", () => {
    expect(boughtSetupServicesFrom([bundled("managed-website", "active"), bundled("social-media", "active")], [sub("social-media", "active")])).toEqual(["social"]);
  });
});
