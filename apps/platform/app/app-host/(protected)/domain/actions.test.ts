import { DomainTakenError, getPrimaryDomain, requestDomainMove, withTenantScope } from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifyTeamDomainRequested } from "@/lib/server/domain-alert";
import { getLiveWebsite } from "@/lib/server/onboarding";
import { requestOwnDomainAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@fynix/db", () => {
  class MockDomainTakenError extends Error {}
  return { DomainTakenError: MockDomainTakenError, getPrimaryDomain: vi.fn(), requestDomainMove: vi.fn(), withTenantScope: vi.fn() };
});
vi.mock("@/lib/server/customer-access", () => ({
  requireCustomerAccess: vi.fn(async () => ({ tenant: { userId: "user-1", businessId: "business-1", businessName: "Bloom", role: "owner" } })),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.test", ADMIN_ORIGIN: "https://console.example.test" }) }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn() }));
vi.mock("@/lib/server/domain-alert", () => ({ notifyTeamDomainRequested: vi.fn() }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const idle = { status: "idle" } as const;
const LIVE = { hostname: "bloom.sites.fynix.digital", launchedAt: null };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.CLIENT_SITE_BASE_DOMAIN = "sites.fynix.digital";
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work({} as never));
  vi.mocked(getPrimaryDomain).mockResolvedValue({ hostname: "bloom.sites.fynix.digital" } as Awaited<ReturnType<typeof getPrimaryDomain>>);
  vi.mocked(getLiveWebsite).mockResolvedValue(LIVE);
  vi.mocked(requestDomainMove).mockResolvedValue({ id: "d1", hostname: "bloom.com", status: "pending", isPrimary: false });
});

describe("requestOwnDomainAction", () => {
  it("saves the request beside their current address and tells the team", async () => {
    await expect(requestOwnDomainAction(idle, form({ domain: "https://www.Bloom.com/", ownerConfirmed: "on" }))).resolves.toEqual({ status: "idle" });
    expect(requestDomainMove).toHaveBeenCalledWith(expect.anything(), { hostname: "bloom.com", ownerConfirmedAt: expect.any(Date) });
    expect(notifyTeamDomainRequested).toHaveBeenCalledWith("business-1", "Bloom", "bloom.com");
  });

  it("refuses unless the website is live on its free address", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue(null);
    await expect(requestOwnDomainAction(idle, form({ domain: "bloom.com", ownerConfirmed: "on" }))).resolves.toMatchObject({ status: "error", field: null });
    expect(requestDomainMove).not.toHaveBeenCalled();

    vi.mocked(getLiveWebsite).mockResolvedValue(LIVE);
    vi.mocked(getPrimaryDomain).mockResolvedValue({ hostname: "bloom.com" } as Awaited<ReturnType<typeof getPrimaryDomain>>);
    await expect(requestOwnDomainAction(idle, form({ domain: "other.com", ownerConfirmed: "on" }))).resolves.toMatchObject({ status: "error", field: null });
  });

  it("needs the ownership box ticked", async () => {
    await expect(requestOwnDomainAction(idle, form({ domain: "bloom.com" }))).resolves.toMatchObject({ status: "error", field: "ownerConfirmed" });
    expect(requestDomainMove).not.toHaveBeenCalled();
  });

  it("refuses something that isn't a domain", async () => {
    await expect(requestOwnDomainAction(idle, form({ domain: "not a domain", ownerConfirmed: "on" }))).resolves.toMatchObject({ status: "error", field: "domain" });
  });

  it("refuses a domain another business already has, without saying whose", async () => {
    vi.mocked(requestDomainMove).mockRejectedValue(new DomainTakenError("bloom.com"));
    const result = await requestOwnDomainAction(idle, form({ domain: "bloom.com", ownerConfirmed: "on" }));
    expect(result).toMatchObject({ status: "error", field: "domain" });
    expect(notifyTeamDomainRequested).not.toHaveBeenCalled();
  });
});
