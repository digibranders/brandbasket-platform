import { attachAccountToNewBusiness, type Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachAccountAndSyncTenant } from "./lead-repair";
import { syncTenantForBusiness } from "./payload-tenant-sync";

// The staff "attach account" repair is the second (and only other) place a business row is created in production —
// see setup.test.ts for the first (invite redemption). attachAccountToNewBusiness itself is already covered by
// packages/db's own integration tests; this only proves the new tenant-sync wiring around it.
vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ attachAccountToNewBusiness: vi.fn() }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));

const mockedAttach = vi.mocked(attachAccountToNewBusiness);
const mockedSyncTenant = vi.mocked(syncTenantForBusiness);
const db = {} as Database;

beforeEach(() => {
  vi.resetAllMocks();
  mockedAttach.mockResolvedValue({ businessId: "business-1", businessName: "Riverside Plumbing" });
  mockedSyncTenant.mockResolvedValue(undefined);
});

describe("attachAccountAndSyncTenant", () => {
  it("syncs a Payload tenant for the business the repair just created, after it commits", async () => {
    const result = await attachAccountAndSyncTenant(db, { leadId: "lead-1", attachedByStaffId: "staff-1" });

    expect(mockedAttach).toHaveBeenCalledWith(db, { leadId: "lead-1", attachedByStaffId: "staff-1" });
    expect(mockedSyncTenant).toHaveBeenCalledWith({ businessId: "business-1", name: "Riverside Plumbing" });
    expect(mockedAttach.mock.invocationCallOrder[0]).toBeLessThan(mockedSyncTenant.mock.invocationCallOrder[0] ?? 0);
    expect(result).toEqual({ businessId: "business-1" });
  });

  it("does not sync a tenant when the repair itself is refused, and lets the failure propagate", async () => {
    const refusal = new Error("Lead already has a business.");
    mockedAttach.mockRejectedValue(refusal);

    await expect(
      attachAccountAndSyncTenant(db, { leadId: "lead-1", attachedByStaffId: "staff-1" }),
    ).rejects.toBe(refusal);
    expect(mockedSyncTenant).not.toHaveBeenCalled();
  });
});
