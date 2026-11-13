import type { SessionUser } from "@brandbasket/shared/lib/access";
import { describe, expect, it } from "vitest";
import { accessRedirect, GUARD_PATHS, requirementRedirect, servicesFrom, type CustomerFacts } from "./guard-rules";

const user: SessionUser = { id: "user-1", email: "owner@example.com", name: "Riley Owner", emailConfirmed: true, phone: null };
const tenant = { userId: user.id, businessId: "0192f3c4-0000-7000-8000-000000000001", businessName: "Riverside Plumbing", role: "owner" } as const;

const facts = (overrides: Partial<CustomerFacts> & { status?: CustomerFacts["billing"]["status"]; hasWebsite?: boolean } = {}): CustomerFacts => {
  const status = overrides.status ?? "paid";
  return {
    role: overrides.role ?? "owner",
    billing: overrides.billing ?? { status, hasWebsite: overrides.hasWebsite ?? status === "paid" },
    services: overrides.services ?? ["website"],
  };
};

describe("accessRedirect", () => {
  it("sends someone signed out to sign in", () => {
    expect(accessRedirect({ kind: "signed-out" })).toBe(GUARD_PATHS.signIn);
  });

  it("sends an account with no business to sign in, as the old app does", () => {
    expect(accessRedirect({ kind: "no-business", user })).toBe(GUARD_PATHS.signIn);
  });

  it("sends a closing account to restore it, whatever else is true of it", () => {
    expect(accessRedirect({ kind: "closing", user, eraseAfter: new Date() })).toBe(GUARD_PATHS.restoreAccount);
  });

  it("lets a member of a business in", () => {
    expect(accessRedirect({ kind: "granted", user, tenant })).toBeNull();
  });
});

describe("requirementRedirect", () => {
  it("lets any member in when nothing more is required, paid or not", () => {
    for (const status of ["unpaid", "paid", "lapsed"] as const) expect(requirementRedirect(facts({ status }), {})).toBeNull();
  });

  it("sends an unpaid business to checkout for anything that needs a payment", () => {
    expect(requirementRedirect(facts({ status: "unpaid" }), { paid: "ever" })).toBe(GUARD_PATHS.checkout);
    expect(requirementRedirect(facts({ status: "unpaid" }), { paid: "live" })).toBe(GUARD_PATHS.checkout);
  });

  it("keeps read access for a lapsed business", () => {
    expect(requirementRedirect(facts({ status: "lapsed" }), { paid: "ever" })).toBeNull();
  });

  it("sends a lapsed business to Plan & billing to reactivate before it can write", () => {
    expect(requirementRedirect(facts({ status: "lapsed" }), { paid: "live" })).toBe(GUARD_PATHS.billing);
  });

  it("lets a paying business write", () => {
    expect(requirementRedirect(facts({ status: "paid" }), { paid: "live" })).toBeNull();
  });

  it("keeps owner-only pages from an editor", () => {
    expect(requirementRedirect(facts({ role: "editor" }), { owner: true })).toBe(GUARD_PATHS.home);
    expect(requirementRedirect(facts({ role: "owner" }), { owner: true })).toBeNull();
  });

  it("asks for payment before it looks at the role", () => {
    expect(requirementRedirect(facts({ role: "editor", status: "unpaid" }), { paid: "ever", owner: true })).toBe(GUARD_PATHS.checkout);
  });

  describe("the Website", () => {
    it("sends a paying business without the Website Management Home (Social-only or SEO-only)", () => {
      const socialOnly = facts({ status: "paid", hasWebsite: false, services: ["social"] });
      expect(requirementRedirect(socialOnly, { paid: "ever", service: "website" })).toBe(GUARD_PATHS.home);
    });

    it("follows billing's rule for a paying business, so a dropped website runs to the end of its month", () => {
      const dropped = facts({ status: "paid", hasWebsite: true, services: [] });
      expect(requirementRedirect(dropped, { paid: "ever", service: "website" })).toBeNull();
      expect(requirementRedirect(dropped, { paid: "live", service: "website" })).toBeNull();
    });

    it("lets a lapsed website customer read their website's pages but not write", () => {
      const lapsed = facts({ status: "lapsed", hasWebsite: false, services: ["website"] });
      expect(requirementRedirect(lapsed, { paid: "ever", service: "website" })).toBeNull();
      expect(requirementRedirect(lapsed, { paid: "live", service: "website" })).toBe(GUARD_PATHS.billing);
    });

    it("sends a lapsed business whose plan had no website Home", () => {
      const lapsed = facts({ status: "lapsed", hasWebsite: false, services: ["search"] });
      expect(requirementRedirect(lapsed, { paid: "ever", service: "website" })).toBe(GUARD_PATHS.home);
    });
  });

  describe("Social & Ads and Local SEO + AEO", () => {
    it("lets a business that bought the service in", () => {
      expect(requirementRedirect(facts({ services: ["social"] }), { paid: "live", service: "social" })).toBeNull();
    });

    it("sends a business that did not buy it Home", () => {
      expect(requirementRedirect(facts({ services: ["website"] }), { paid: "ever", service: "search" })).toBe(GUARD_PATHS.home);
    });
  });
});

describe("servicesFrom", () => {
  const line = (addOn: string, status = "active", endRequestedAt: Date | null = null) => ({ addOn, status, endRequestedAt });

  it("lists the services in catalogue order", () => {
    expect(servicesFrom([line("managed-website")], ["search", "social"])).toEqual(["website", "social", "search"]);
  });

  it("leaves out a pending website line and one on its way out", () => {
    expect(servicesFrom([line("managed-website", "pending")], [])).toEqual([]);
    expect(servicesFrom([line("managed-website", "active", new Date())], [])).toEqual([]);
  });

  it("takes Social and Search only from the db package's rule, not from the plan lines", () => {
    expect(servicesFrom([line("social-media"), line("paid-ads")], [])).toEqual([]);
  });
});
