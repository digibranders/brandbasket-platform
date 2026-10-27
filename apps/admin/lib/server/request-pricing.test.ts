import { findBillingState } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPricing } from "./request-pricing";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), findBillingState: vi.fn() }));
vi.mock("@brandbasket/shared/lib/billing/status", () => ({ summariseBilling: vi.fn(() => ({ hasWebsite: true })) }));

import { summariseBilling } from "@brandbasket/shared/lib/billing/status";

const DB = { kind: "staff-db" } as never;
const NOW = new Date("2026-11-28T05:00:00.000Z");
const PLAN = { currency: "INR", extraHourAmountCents: 50_000, extraPublishAmountCents: 30_000, extraBlogPostsAmountCents: 47_500, blogPostBlockSize: 100 };

beforeEach(() => {
  vi.mocked(findBillingState).mockReset();
  vi.mocked(summariseBilling).mockReturnValue({ hasWebsite: true } as never);
});

describe("requestPricing", () => {
  it("takes the hour's price and currency from the customer's plan, and the allowance from whether they hold the website", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ plan: PLAN } as never);
    expect(await requestPricing(DB, "business-1", NOW)).toEqual({ unitCents: 50_000, currency: "INR", includedAllowed: 2 });
    expect(findBillingState).toHaveBeenCalledWith(DB, "business-1");
  });

  it("allows no included edits for a plan without the website", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ plan: PLAN } as never);
    vi.mocked(summariseBilling).mockReturnValue({ hasWebsite: false } as never);
    expect(await requestPricing(DB, "business-1", NOW)).toMatchObject({ includedAllowed: 0 });
  });

  it("is null for a business with no plan or that cannot be found", async () => {
    vi.mocked(findBillingState).mockResolvedValue({ plan: null } as never);
    expect(await requestPricing(DB, "business-1", NOW)).toBeNull();
    vi.mocked(findBillingState).mockResolvedValue(null);
    expect(await requestPricing(DB, "business-1", NOW)).toBeNull();
  });
});
