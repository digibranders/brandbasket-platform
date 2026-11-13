import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerAccess } from "@brandbasket/shared/lib/access";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock("@brandbasket/db", () => ({ findBillingState: vi.fn(), findBusinessEntry: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("./customer-tenant", () => ({ getCustomerAccess: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));

const { findBillingState, findBusinessEntry, withTenantScope } = await import("@brandbasket/db");
const { getCustomerAccess } = await import("./customer-tenant");
const { ReadOnlyMemberError, requireCustomerAccess, requireWebsiteClient } = await import("./customer-access");
const { requireBillingAccess, requireWebsiteAccess } = await import("./billing");

const USER = { id: "user-a", email: "ana@example.com", name: "Ana", emailConfirmed: true, phone: null };

function signedInAs(role: "owner" | "editor" | "viewer"): void {
  const access: CustomerAccess = { kind: "granted", user: USER, tenant: { userId: USER.id, businessId: "biz-1", businessName: "Riverside", role } };
  vi.mocked(getCustomerAccess).mockResolvedValue(access);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: "managed" } as never);
  vi.mocked(findBillingState).mockResolvedValue(null as never);
  // The business is read through the tenant scope; a null billing state would throw, so hand back a paid-looking summary shape.
  vi.mocked(withTenantScope).mockImplementation((async (_db: unknown, _tenant: unknown, run: (tx: unknown) => unknown) => run({})) as never);
});

describe("requireCustomerAccess with a role", () => {
  it("sends anyone but the owner Home from an owner page, before reading the business", async () => {
    for (const role of ["editor", "viewer"] as const) {
      signedInAs(role);
      await expect(requireCustomerAccess({ access: "owner" })).rejects.toThrow("NEXT_REDIRECT /");
    }
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("refuses a viewer a write with a specific error, and not an editor", async () => {
    signedInAs("viewer");
    await expect(requireCustomerAccess({ access: "write" })).rejects.toBeInstanceOf(ReadOnlyMemberError);
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("lets the roles through that the option allows", async () => {
    // Past the role check the call goes on to read billing, which these mocks leave undefined: reaching it is the proof.
    for (const [role, access] of [["owner", "owner"], ["owner", "write"], ["editor", "write"], ["viewer", undefined], ["editor", undefined]] as const) {
      signedInAs(role);
      vi.mocked(withTenantScope).mockClear();
      await requireCustomerAccess({ access }).catch(() => undefined);
      expect(withTenantScope).toHaveBeenCalled();
    }
  });

  it("still sends the signed-out to sign in, whatever role was asked", async () => {
    vi.mocked(getCustomerAccess).mockResolvedValue({ kind: "signed-out" });
    await expect(requireCustomerAccess({ access: "owner" })).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("the other guards", () => {
  it("requireBillingAccess and requireWebsiteAccess refuse a viewer by default and take the owner when asked", async () => {
    signedInAs("viewer");
    await expect(requireBillingAccess()).rejects.toBeInstanceOf(ReadOnlyMemberError);
    await expect(requireWebsiteAccess()).rejects.toBeInstanceOf(ReadOnlyMemberError);
    signedInAs("editor");
    await expect(requireBillingAccess("owner")).rejects.toThrow("NEXT_REDIRECT /");
  });

  it("requireWebsiteClient passes its role on", async () => {
    signedInAs("viewer");
    await expect(requireWebsiteClient("write")).rejects.toBeInstanceOf(ReadOnlyMemberError);
  });
});
