import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ name: "staff-db" })) }));
vi.mock("@brandbasket/db", () => ({ findBillingState: vi.fn() }));

import { findBillingState } from "@brandbasket/db";
import { getPayload } from "payload";
import { findOnlineTenantBySiteToken, siteHasAccess } from "./site-api";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const FUTURE = new Date("2026-11-15T09:00:00.000Z");
const PAST = new Date("2026-10-10T09:00:00.000Z");

const WEBSITE_LINE = { addOn: "managed-website", status: "active" };
const SOCIAL_LINE = { addOn: "digital-growth", status: "active" };

function stateWith(status: string, paidThroughAt: Date | null, addOns: readonly object[] = [WEBSITE_LINE]): never {
  return { subscription: { status, paidThroughAt }, addOns } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("siteHasAccess: a website is served only while its plan and its Managed Website line are", () => {
  it("serves a paid and healthy website", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", FUTURE));
    expect(await siteHasAccess("biz-1", NOW)).toBe(true);
  });

  it("keeps serving while the provider retries a failed payment inside the paid month", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("past_due", FUTURE));
    expect(await siteHasAccess("biz-1", NOW)).toBe(true);
  });

  it("stops the moment the provider gives up, even with paid time left (no grace period)", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("inactive", FUTURE));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
  });

  it("stops once the paid month has run out with nothing renewed", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", PAST));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
  });

  it("never serves a paid Social-only or SEO-only client: no Managed Website line, no site", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", FUTURE, [SOCIAL_LINE]));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", FUTURE, []));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
  });

  it("keeps serving a dropped website to the end of the paid month, then stops", async () => {
    const dropped = [{ ...WEBSITE_LINE, endRequestedAt: PAST }];
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", FUTURE, dropped));
    expect(await siteHasAccess("biz-1", NOW)).toBe(true);
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", PAST, dropped));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
  });

  it("never serves a business that has not paid, or has no subscription at all", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("incomplete", null));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
    vi.mocked(findBillingState).mockResolvedValue({ subscription: null } as never);
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
    vi.mocked(findBillingState).mockResolvedValue(null);
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
  });
});

describe("findOnlineTenantBySiteToken: the routes that answer a bad token the same way", () => {
  function tokenBelongsTo(businessId: string): void {
    vi.mocked(getPayload).mockResolvedValue({
      find: vi.fn().mockResolvedValue({ docs: [{ businessId, name: "Riverside Dental" }] }),
    } as never);
  }

  it("finds the tenant of a business that holds the Managed Website service", async () => {
    tokenBelongsTo("biz-1");
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", new Date(Date.now() + 86_400_000)));
    expect(await findOnlineTenantBySiteToken("token")).toEqual({ businessId: "biz-1", name: "Riverside Dental" });
  });

  it("finds nothing for a paid Social-only client", async () => {
    tokenBelongsTo("biz-2");
    vi.mocked(findBillingState).mockResolvedValue(stateWith("active", new Date(Date.now() + 86_400_000), [SOCIAL_LINE]));
    expect(await findOnlineTenantBySiteToken("token")).toBeNull();
  });
});
