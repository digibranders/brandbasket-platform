import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class BusinessInviteOpenError extends Error {}
  return {
    acceptBusinessInvite: vi.fn(),
    BUSINESS_INVITE_DAYS: 7,
    BusinessInviteOpenError,
    consumeRateLimit: vi.fn(),
    createBusinessInvite: vi.fn(),
    listBusinessInvites: vi.fn(),
    listBusinessMembersForStaff: vi.fn(),
    listMembershipsForUser: vi.fn(),
    removeBusinessMember: vi.fn(),
    revokeBusinessInvite: vi.fn(),
    withTenantScope: vi.fn(),
  };
});
vi.mock("@brandbasket/email", () => ({ businessInviteEmail: vi.fn((input: unknown) => ({ template: "business-invite", input })) }));
vi.mock("@brandbasket/shared/server/error-log-info", () => ({ errorLogInfo: vi.fn(() => ({})) }));
vi.mock("./db", () => ({ getAppDb: vi.fn(() => "app-db"), getStaffDb: vi.fn(() => "staff-db") }));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn(() => "public-db") }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: vi.fn(() => ({ APP_ORIGIN: "https://app.brandbasket.in" })) }));

const db = await import("@brandbasket/db");
const { customerEmailTransport } = await import("./email");
const team = await import("./team");
const { businessInviteEmail } = await import("@brandbasket/email");
const { TOO_MANY_INVITES_MESSAGE, ALREADY_IN_A_BUSINESS_MESSAGE } = await import("@/lib/team/rules");

const TENANT = { userId: "owner-1", businessId: "biz-1", businessName: "Riverside", role: "owner" } as const;
const USER = { id: "owner-1", email: "Owner@Example.com", name: "Olu", emailConfirmed: true, phone: null };
const CUSTOMER = { user: USER, tenant: TENANT };
const TOKEN = "T".repeat(43);
const send = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.consumeRateLimit).mockResolvedValue({ allowed: true } as never);
  vi.mocked(db.withTenantScope).mockImplementation((async (_db: unknown, _tenant: unknown, run: (tx: string) => unknown) => run("tx")) as never);
  vi.mocked(db.listMembershipsForUser).mockResolvedValue([]);
  vi.mocked(db.createBusinessInvite).mockResolvedValue({ token: TOKEN, invite: { id: "inv-1" } } as never);
  vi.mocked(customerEmailTransport).mockReturnValue({ send } as never);
  send.mockResolvedValue(undefined);
});

describe("inviteMember", () => {
  it("stores the invite for the session's business and emails the accept link", async () => {
    await expect(team.inviteMember(CUSTOMER, { email: "front@example.com", role: "viewer" })).resolves.toEqual({ ok: true });
    expect(db.createBusinessInvite).toHaveBeenCalledWith("tx", { invitedBy: "owner-1", email: "front@example.com", role: "viewer" });
    expect(db.withTenantScope).toHaveBeenCalledWith("app-db", TENANT, expect.any(Function));
    expect(customerEmailTransport).toHaveBeenCalledWith("public-db");
    expect(send).toHaveBeenCalledWith({
      template: "business-invite",
      input: {
        to: "front@example.com",
        inviterName: "Olu",
        businessName: "Riverside",
        roleLabel: "Viewer",
        acceptUrl: `https://app.brandbasket.in/invite/${TOKEN}`,
        expiresInDays: 7,
      },
    });
  });

  it("spends 20 an hour per owner, and sends nothing past that", async () => {
    await team.inviteMember(CUSTOMER, { email: "front@example.com", role: "editor" });
    expect(db.consumeRateLimit).toHaveBeenCalledWith("app-db", "business-invite:user:owner-1", { limit: 20, windowSeconds: 3600 });
    vi.mocked(db.consumeRateLimit).mockResolvedValue({ allowed: false } as never);
    const result = await team.inviteMember(CUSTOMER, { email: "front@example.com", role: "editor" });
    expect(result).toMatchObject({ ok: false });
    expect(db.createBusinessInvite).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses the owner's own address, in any case, before spending anything", async () => {
    const result = await team.inviteMember(CUSTOMER, { email: "owner@example.com", role: "editor" });
    expect(result).toMatchObject({ ok: false, field: "email" });
    expect(db.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("says so when the address already has an open invitation", async () => {
    vi.mocked(db.createBusinessInvite).mockRejectedValue(new db.BusinessInviteOpenError());
    expect(await team.inviteMember(CUSTOMER, { email: "front@example.com", role: "editor" })).toMatchObject({ ok: false, field: "email" });
    expect(send).not.toHaveBeenCalled();
  });

  it("takes the invite back when the email cannot be sent", async () => {
    send.mockRejectedValue(new Error("brevo down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await team.inviteMember(CUSTOMER, { email: "front@example.com", role: "editor" });
    expect(result).toMatchObject({ ok: false });
    expect(db.revokeBusinessInvite).toHaveBeenCalledWith("tx", "inv-1");
  });
});

describe("inviteMember: abuse limits", () => {
  it("allows 3 invitations a day to one address, keyed on the lower-cased address across businesses", async () => {
    await team.inviteMember(CUSTOMER, { email: "Front@Example.com", role: "editor" });
    expect(db.consumeRateLimit).toHaveBeenCalledWith("app-db", "business-invite:to:front@example.com", { limit: 3, windowSeconds: 86_400 });
  });

  it("refuses with the too-many-invites message, stores nothing and sends nothing once the address has had 3", async () => {
    vi.mocked(db.consumeRateLimit).mockImplementation((async (_db: unknown, key: string) => ({ allowed: !key.startsWith("business-invite:to:") })) as never);
    const result = await team.inviteMember(CUSTOMER, { email: "front@example.com", role: "editor" });
    expect(result).toEqual({ ok: false, message: TOO_MANY_INVITES_MESSAGE, field: null });
    expect(db.createBusinessInvite).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("cuts a long inviter and business name to 60 characters at a word boundary, with no ellipsis", async () => {
    const long = `${"Northern ".repeat(10)}Trading`;
    const customer = { user: { ...USER, name: long }, tenant: { ...TENANT, businessName: long } };
    await team.inviteMember(customer, { email: "front@example.com", role: "editor" });
    const input = vi.mocked(businessInviteEmail).mock.calls[0]?.[0];
    expect(input?.inviterName).toBe(`${"Northern ".repeat(6)}`.trimEnd());
    expect(input?.businessName).toBe(input?.inviterName);
    expect(input?.inviterName.length).toBeLessThanOrEqual(60);
    expect(input?.inviterName).not.toMatch(/[…]|\.\.\./);
  });
});

describe("revokeInvite", () => {
  it("revokes inside the session's tenant scope", async () => {
    vi.mocked(db.revokeBusinessInvite).mockResolvedValue(true);
    expect(await team.revokeInvite(TENANT, "inv-1")).toEqual({ ok: true });
    expect(db.withTenantScope).toHaveBeenCalledWith("app-db", TENANT, expect.any(Function));
  });

  it("says when the invite was already used or taken back", async () => {
    vi.mocked(db.revokeBusinessInvite).mockResolvedValue(false);
    expect(await team.revokeInvite(TENANT, "inv-1")).toMatchObject({ ok: false });
  });
});

describe("removeMember", () => {
  it("removes on the staff connection for the session's business", async () => {
    vi.mocked(db.removeBusinessMember).mockResolvedValue(true);
    expect(await team.removeMember(CUSTOMER, "user-2")).toEqual({ ok: true });
    expect(db.removeBusinessMember).toHaveBeenCalledWith("staff-db", { businessId: "biz-1", userId: "user-2" });
  });

  it("never lets the owner remove themselves, and reports an owner or a stranger as not removable", async () => {
    expect(await team.removeMember(CUSTOMER, "owner-1")).toMatchObject({ ok: false });
    expect(db.removeBusinessMember).not.toHaveBeenCalled();
    vi.mocked(db.removeBusinessMember).mockResolvedValue(false);
    expect(await team.removeMember(CUSTOMER, "user-9")).toMatchObject({ ok: false });
  });
});

describe("acceptInvite", () => {
  it("accepts for the signed-in person, with their own address", async () => {
    vi.mocked(db.acceptBusinessInvite).mockResolvedValue({ kind: "accepted", businessId: "biz-1", role: "editor" });
    expect(await team.acceptInvite(USER, TOKEN)).toEqual({ ok: true });
    expect(db.acceptBusinessInvite).toHaveBeenCalledWith("staff-db", { token: TOKEN, userId: "owner-1", userEmail: "Owner@Example.com" });
    expect(db.consumeRateLimit).toHaveBeenCalledWith("app-db", "business-invite-accept:user:owner-1", { limit: 10, windowSeconds: 3600 });
  });

  it("refuses a person who already belongs to a business, leaving the invite unused", async () => {
    vi.mocked(db.listMembershipsForUser).mockResolvedValue([{ businessId: "biz-9", businessName: "Other", role: "owner" }]);
    const result = await team.acceptInvite(USER, TOKEN);
    expect(result).toEqual({ ok: false, message: ALREADY_IN_A_BUSINESS_MESSAGE, field: null });
    expect(result).toMatchObject({ message: "This account already belongs to a business, so it cannot join another team yet. Ask the owner to invite a different email address." });
    expect(db.listMembershipsForUser).toHaveBeenCalledWith("app-db", "owner-1");
    expect(db.acceptBusinessInvite).not.toHaveBeenCalled();
  });

  it("refuses a token that is not shaped like ours without touching the database", async () => {
    expect(await team.acceptInvite(USER, "short")).toMatchObject({ ok: false });
    expect(db.consumeRateLimit).not.toHaveBeenCalled();
    expect(db.acceptBusinessInvite).not.toHaveBeenCalled();
  });

  it("stops at 10 tries an hour", async () => {
    vi.mocked(db.consumeRateLimit).mockResolvedValue({ allowed: false } as never);
    expect(await team.acceptInvite(USER, TOKEN)).toMatchObject({ ok: false });
    expect(db.acceptBusinessInvite).not.toHaveBeenCalled();
  });

  it("explains why an invitation was refused", async () => {
    vi.mocked(db.acceptBusinessInvite).mockResolvedValue({ kind: "refused", reason: "wrong_email" });
    const result = await team.acceptInvite(USER, TOKEN);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("different email address") });
  });
});

describe("loadMembers and loadInvites", () => {
  it("marks the signed-in owner as you and reads the session's business only", async () => {
    vi.mocked(db.listBusinessMembersForStaff).mockResolvedValue([
      { userId: "owner-1", name: "Olu", email: "o@example.com", phone: null, role: "owner", joinedAt: new Date("2026-10-01") },
      { userId: "user-2", name: "Fran", email: null, phone: null, role: "viewer", joinedAt: new Date("2026-10-02") },
    ]);
    const members = await team.loadMembers(TENANT);
    expect(db.listBusinessMembersForStaff).toHaveBeenCalledWith("staff-db", "biz-1");
    expect(members.map((member) => [member.userId, member.isYou])).toEqual([["owner-1", true], ["user-2", false]]);
  });

  it("lists pending invites through the tenant scope", async () => {
    vi.mocked(db.listBusinessInvites).mockResolvedValue([
      { id: "inv-1", businessId: "biz-1", email: "a@example.com", role: "editor", invitedBy: "owner-1", expiresAt: new Date("2026-11-20"), acceptedAt: null, revokedAt: null, createdAt: new Date("2026-11-13") },
    ]);
    const invites = await team.loadInvites(TENANT, new Date("2026-11-13"));
    expect(invites).toMatchObject([{ id: "inv-1", status: "open" }]);
  });
});
