import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ name: "staff-db" })) }));
vi.mock("@brandbasket/db", () => ({ findBillingState: vi.fn() }));

import { findBillingState } from "@brandbasket/db";
import { siteHasAccess } from "./site-api";

const NOW = new Date("2026-10-20T09:00:00.000Z");
const FUTURE = new Date("2026-11-15T09:00:00.000Z");
const PAST = new Date("2026-10-10T09:00:00.000Z");

function stateWith(status: string, paidThroughAt: Date | null): never {
  return { subscription: { status, paidThroughAt } } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("siteHasAccess: a website is served only while its plan is", () => {
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

  it("never serves a business that has not paid, or has no subscription at all", async () => {
    vi.mocked(findBillingState).mockResolvedValue(stateWith("incomplete", null));
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
    vi.mocked(findBillingState).mockResolvedValue({ subscription: null } as never);
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
    vi.mocked(findBillingState).mockResolvedValue(null);
    expect(await siteHasAccess("biz-1", NOW)).toBe(false);
  });
});
