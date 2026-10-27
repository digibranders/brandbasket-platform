import { findLiveBundledAddOns, listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { loadSetupServices } from "./first-look";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/billing/receipt-download", () => ({ receiptDownloadHref: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ findFirstPayment: vi.fn(), findLiveBundledAddOns: vi.fn(), listBoughtSetupServices: vi.fn(), withTenantScope: vi.fn() }));

const appTx = { name: "app-tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;
const line = (addOn: string, status = "active") => ({ addOn, status, endRequestedAt: null }) as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({ name: "app-db" } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
});

describe("loadSetupServices", () => {
  it("keeps the website from the plan and takes Social and Search from the one bought-services rule", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([line("managed-website")]);
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["social", "search"]);

    expect(await loadSetupServices(tenant)).toEqual(["website", "social", "search"]);
    expect(listBoughtSetupServices).toHaveBeenCalledWith(appTx, "business-1");
  });

  it("shows Social for a service bought after sign-up even though the plan does not bundle it", async () => {
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([]);
    vi.mocked(listBoughtSetupServices).mockResolvedValue(["social"]);

    expect(await loadSetupServices(tenant)).toEqual(["social"]);
  });

  it("returns null, so a caller can tell a failed read from no services, and logs once", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(findLiveBundledAddOns).mockResolvedValue([]);
    vi.mocked(listBoughtSetupServices).mockRejectedValue(new Error("db down"));

    expect(await loadSetupServices(tenant)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe("[first-look] could not read the services");
    log.mockRestore();
  });
});
