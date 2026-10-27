import { describe, expect, it } from "vitest";
import { boughtSetupServicesFrom } from "./service-setup";

const bundled = (addOn: string, status: string, endRequestedAt: Date | null = null) => ({ addOn, status, endRequestedAt }) as never;
const sub = (addOn: string, status: string) => ({ addOn, status }) as never;

describe("boughtSetupServicesFrom", () => {
  it("counts nothing for a business with no add-ons", () => {
    expect(boughtSetupServicesFrom([], [])).toEqual([]);
  });

  it("maps digital-growth to social and local-seo-aeo to search, in a stable order", () => {
    expect(boughtSetupServicesFrom([bundled("local-seo-aeo", "active"), bundled("digital-growth", "pending")], [])).toEqual(["social", "search"]);
  });

  it("counts a paid add-on subscription that is active, scheduled or past due", () => {
    for (const status of ["active", "scheduled", "past_due"]) {
      expect(boughtSetupServicesFrom([], [sub("digital-growth", status)])).toEqual(["social"]);
    }
  });

  it("ignores add-ons that are removed, unpaid, halted or cancelled", () => {
    expect(
      boughtSetupServicesFrom(
        [bundled("digital-growth", "removed")],
        [sub("local-seo-aeo", "incomplete"), sub("local-seo-aeo", "halted"), sub("digital-growth", "cancelled")],
      ),
    ).toEqual([]);
  });

  it("ignores a bundled add-on whose end is already requested", () => {
    expect(boughtSetupServicesFrom([bundled("digital-growth", "active", new Date())], [])).toEqual([]);
  });

  it("ignores the managed website and lists a service once when it is bought two ways", () => {
    expect(boughtSetupServicesFrom([bundled("managed-website", "active"), bundled("digital-growth", "active")], [sub("digital-growth", "active")])).toEqual(["social"]);
  });
});
