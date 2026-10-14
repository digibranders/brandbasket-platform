import { findBillingState, findOpenClosureForUser, listMembershipsForUser, withTenantScope, type Database } from "@fynix/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerTenant } from "./customer-tenant";
import { getAppDb, getStaffDb } from "./db";
import { getSessionUser } from "./session";

vi.mock("server-only", () => ({}));
vi.mock("./session", () => ({ getSessionUser: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@fynix/db", () => ({
  findBillingState: vi.fn(),
  findOpenClosureForUser: vi.fn(),
  listMembershipsForUser: vi.fn(),
  withTenantScope: vi.fn(),
}));

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const USER = { id: "user-a", email: "ana@example.com", name: "Ana Diaz", emailConfirmed: true, phone: null };
const appDb = { name: "app-db" } as unknown as Database;
const staffDb = { name: "staff-db" } as unknown as Database;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(findOpenClosureForUser).mockResolvedValue(null);
  vi.mocked(getSessionUser).mockResolvedValue(USER);
  vi.mocked(listMembershipsForUser).mockResolvedValue([
    { businessId: BUSINESS_ID, businessName: "Riverside Plumbing", role: "owner" },
  ]);
});

describe("getCustomerTenant", () => {
  it("resolves the business from the session and membership, and never reads billing", async () => {
    await expect(getCustomerTenant()).resolves.toEqual({
      userId: USER.id,
      businessId: BUSINESS_ID,
      businessName: "Riverside Plumbing",
      role: "owner",
    });
    expect(listMembershipsForUser).toHaveBeenCalledWith(appDb, USER.id);
    expect(findBillingState).not.toHaveBeenCalled();
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("is null without a session, and reads nothing else", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);
    await expect(getCustomerTenant()).resolves.toBeNull();
    expect(listMembershipsForUser).not.toHaveBeenCalled();
  });

  it("is null for an account with no business", async () => {
    vi.mocked(listMembershipsForUser).mockResolvedValue([]);
    await expect(getCustomerTenant()).resolves.toBeNull();
    expect(findBillingState).not.toHaveBeenCalled();
  });

  it("is null for an account that asked to be deleted, and reads no membership for it", async () => {
    vi.mocked(findOpenClosureForUser).mockResolvedValue({
      id: "closure-1",
      userId: USER.id,
      businessId: BUSINESS_ID,
      requestedAt: new Date("2026-10-06T00:00:00Z"),
      eraseAfter: new Date("2026-11-05T00:00:00Z"),
    });
    await expect(getCustomerTenant()).resolves.toBeNull();
    expect(findOpenClosureForUser).toHaveBeenCalledWith(staffDb, USER.id);
    expect(listMembershipsForUser).not.toHaveBeenCalled();
  });
});
