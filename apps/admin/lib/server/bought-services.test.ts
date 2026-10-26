import { describe, expect, it, vi } from "vitest";
import { boughtServicesFrom } from "./bought-services";

vi.mock("server-only", () => ({}));

const NONE = null;
const bundled = (addOn: string, status: string, endRequestedAt: Date | null = NONE) => ({ addOn, status, endRequestedAt }) as never;
const sub = (addOn: string, status: string) => ({ addOn, status }) as never;

describe("boughtServicesFrom", () => {
  it("counts nothing for a business with no add-ons", () => {
    expect(boughtServicesFrom([], [])).toEqual([]);
  });

  it("maps digital-growth to social and local-seo-aeo to search, in a stable order", () => {
    expect(boughtServicesFrom([bundled("local-seo-aeo", "active"), bundled("digital-growth", "pending")], [])).toEqual(["social", "search"]);
  });

  it("counts a paid add-on subscription that is active, scheduled or past due", () => {
    for (const status of ["active", "scheduled", "past_due"]) {
      expect(boughtServicesFrom([], [sub("digital-growth", status)])).toEqual(["social"]);
    }
  });

  it("ignores add-ons that are removed, unpaid, halted or cancelled", () => {
    expect(
      boughtServicesFrom(
        [bundled("digital-growth", "removed")],
        [sub("local-seo-aeo", "incomplete"), sub("local-seo-aeo", "halted"), sub("digital-growth", "cancelled")],
      ),
    ).toEqual([]);
  });

  it("ignores a bundled add-on whose end is already requested", () => {
    expect(boughtServicesFrom([bundled("digital-growth", "active", new Date())], [])).toEqual([]);
  });

  it("ignores the managed website and lists a service once when it is bought two ways", () => {
    expect(boughtServicesFrom([bundled("managed-website", "active"), bundled("digital-growth", "active")], [sub("digital-growth", "active")])).toEqual(["social"]);
  });
});
