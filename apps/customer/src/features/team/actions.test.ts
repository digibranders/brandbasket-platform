import { beforeEach, describe, expect, it, vi } from "vitest";
import { acceptInviteAction, inviteAction, revokeInviteAction } from "./actions";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirected to ${to}`);
  }
}
const mocks = vi.hoisted(() => ({
  OpenInviteError: class OpenInviteError extends Error {},
  requireOwner: vi.fn(),
  requireSignedIn: vi.fn(),
  consumeRateLimit: vi.fn(),
  createBusinessInvite: vi.fn(),
  revokeBusinessInvite: vi.fn(),
  acceptBusinessInvite: vi.fn(),
  withTenantScope: vi.fn(),
  send: vi.fn(),
  report: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Redirected) throw error;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  BUSINESS_INVITE_DAYS: 7,
  BusinessInviteOpenError: mocks.OpenInviteError,
  acceptBusinessInvite: mocks.acceptBusinessInvite,
  consumeRateLimit: mocks.consumeRateLimit,
  createBusinessInvite: mocks.createBusinessInvite,
  revokeBusinessInvite: mocks.revokeBusinessInvite,
  withTenantScope: mocks.withTenantScope,
}));
vi.mock("@brandbasket/email", () => ({ businessInviteEmail: (input: unknown) => ({ template: "business-invite", input }) }));
vi.mock("@/features/server-common/email", () => ({ customerEmailTransport: () => ({ send: mocks.send }) }));
vi.mock("@/lib/guards", () => ({ requireOwner: mocks.requireOwner, requireSignedIn: mocks.requireSignedIn }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app" }), getPublicDb: () => ({ name: "public" }), getStaffDb: () => ({ name: "staff" }) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@/lib/report", () => ({ reportError: mocks.report }));

const TOKEN = "T".repeat(43);
const TENANT = { userId: "owner-1", businessId: "0198f2c0-0000-7000-8000-000000000001", businessName: "Apex Diagnostics", role: "owner" };
const OWNER = { user: { id: "owner-1", name: "Anand Verma", email: "Anand@Apex.in" }, tenant: TENANT, businessId: TENANT.businessId, businessName: "Apex Diagnostics" };
const INVITE_ID = "0198f2c0-1111-7000-8000-000000000002";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireOwner.mockResolvedValue(OWNER);
  mocks.requireSignedIn.mockResolvedValue({ user: { id: "invitee-1", email: "Front@Apex.in" } });
  mocks.consumeRateLimit.mockResolvedValue({ allowed: true });
  mocks.withTenantScope.mockImplementation(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({ name: "tx" }));
  mocks.createBusinessInvite.mockResolvedValue({ token: TOKEN, invite: { id: INVITE_ID } });
  mocks.revokeBusinessInvite.mockResolvedValue(true);
});

describe("inviteAction", () => {
  it("is for the owner: a viewer or an editor is sent away by the guard and nothing is stored or sent", async () => {
    mocks.requireOwner.mockRejectedValue(new Redirected("/"));
    await expect(inviteAction(form({ email: "a@example.com", role: "viewer" }))).rejects.toThrow(Redirected);
    expect(mocks.createBusinessInvite).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("refuses a bad address or a role that is not Editor or Viewer before anything is stored", async () => {
    expect(await inviteAction(form({ email: "nobody", role: "viewer" }))).toMatchObject({ ok: false, fieldErrors: { email: "Enter a valid email address." } });
    expect(await inviteAction(form({ email: "a@example.com", role: "owner" }))).toMatchObject({ ok: false, fieldErrors: { role: "Choose Editor or Viewer." } });
    expect(mocks.createBusinessInvite).not.toHaveBeenCalled();
  });

  it("refuses the owner's own address", async () => {
    expect(await inviteAction(form({ email: "anand@apex.in", role: "editor" }))).toMatchObject({ ok: false, fieldErrors: { email: expect.stringContaining("your own address") } });
    expect(mocks.createBusinessInvite).not.toHaveBeenCalled();
  });

  it("stores the invite for the session's business and inviter, then emails the link to /invite/<token>", async () => {
    const result = await inviteAction(form({ email: " Front@Apex.in ", role: "viewer", invitedBy: "attacker", businessId: "other-business" }));
    expect(result).toEqual({ ok: true });
    expect(mocks.withTenantScope).toHaveBeenCalledWith({ name: "app" }, TENANT, expect.any(Function));
    expect(mocks.createBusinessInvite).toHaveBeenCalledWith({ name: "tx" }, { invitedBy: "owner-1", email: "front@apex.in", role: "viewer" });
    expect(mocks.send).toHaveBeenCalledWith({
      template: "business-invite",
      input: {
        to: "front@apex.in",
        inviterName: "Anand Verma",
        businessName: "Apex Diagnostics",
        roleLabel: "Viewer",
        acceptUrl: `https://app.brandbasket.in/invite/${TOKEN}`,
        expiresInDays: 7,
      },
    });
  });

  it("says so when the address already has an invitation", async () => {
    mocks.createBusinessInvite.mockRejectedValue(new mocks.OpenInviteError());
    expect(await inviteAction(form({ email: "front@apex.in", role: "editor" }))).toMatchObject({ ok: false, fieldErrors: { email: expect.stringContaining("already has an invitation") } });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("takes the invite back and says nothing was saved when the email cannot be sent", async () => {
    mocks.send.mockRejectedValue(new Error("brevo down"));
    expect(await inviteAction(form({ email: "front@apex.in", role: "editor" }))).toMatchObject({ ok: false, message: expect.stringContaining("Nothing was saved") });
    expect(mocks.revokeBusinessInvite).toHaveBeenCalledWith({ name: "tx" }, INVITE_ID);
    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("stops a flood of invitations", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false });
    expect(await inviteAction(form({ email: "front@apex.in", role: "editor" }))).toMatchObject({ ok: false });
    expect(mocks.createBusinessInvite).not.toHaveBeenCalled();
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith({ name: "app" }, "business-invite:user:owner-1", { limit: 20, windowSeconds: 3600 });
  });
});

describe("revokeInviteAction", () => {
  it("is for the owner", async () => {
    mocks.requireOwner.mockRejectedValue(new Redirected("/"));
    await expect(revokeInviteAction(INVITE_ID)).rejects.toThrow(Redirected);
    expect(mocks.revokeBusinessInvite).not.toHaveBeenCalled();
  });

  it("revokes inside the owner's own business scope", async () => {
    expect(await revokeInviteAction(INVITE_ID)).toEqual({ ok: true });
    expect(mocks.withTenantScope).toHaveBeenCalledWith({ name: "app" }, TENANT, expect.any(Function));
    expect(mocks.revokeBusinessInvite).toHaveBeenCalledWith({ name: "tx" }, INVITE_ID);
  });

  it("refuses an id that is not an id and says so when there is nothing open to revoke", async () => {
    expect(await revokeInviteAction("not-an-id")).toMatchObject({ ok: false });
    expect(mocks.revokeBusinessInvite).not.toHaveBeenCalled();
    mocks.revokeBusinessInvite.mockResolvedValue(false);
    expect(await revokeInviteAction(INVITE_ID)).toMatchObject({ ok: false, message: expect.stringContaining("already used or taken back") });
  });
});

describe("acceptInviteAction", () => {
  it("accepts for the signed-in person's own id and address, then goes Home", async () => {
    mocks.acceptBusinessInvite.mockResolvedValue({ kind: "accepted", businessId: TENANT.businessId, role: "viewer" });
    await expect(acceptInviteAction(TOKEN)).rejects.toMatchObject({ to: "/" });
    expect(mocks.acceptBusinessInvite).toHaveBeenCalledWith({ name: "staff" }, { token: TOKEN, userId: "invitee-1", userEmail: "Front@Apex.in" });
  });

  it.each([
    ["not_found", "not valid"],
    ["revoked", "withdrew"],
    ["expired", "expired"],
    ["used", "already been used"],
    ["wrong_email", "different email address"],
  ] as const)("maps a %s refusal to a clear message", async (reason, words) => {
    mocks.acceptBusinessInvite.mockResolvedValue({ kind: "refused", reason });
    const result = await acceptInviteAction(TOKEN);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining(words) });
  });

  it("refuses a token that is not shaped like ours without asking the database", async () => {
    expect(await acceptInviteAction("short")).toMatchObject({ ok: false });
    expect(mocks.acceptBusinessInvite).not.toHaveBeenCalled();
  });

  it("limits how many links a person can try in an hour", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false });
    expect(await acceptInviteAction(TOKEN)).toMatchObject({ ok: false });
    expect(mocks.acceptBusinessInvite).not.toHaveBeenCalled();
  });

  it("explains a fault in words and reports it", async () => {
    mocks.acceptBusinessInvite.mockRejectedValue(new Error("db down"));
    expect(await acceptInviteAction(TOKEN)).toMatchObject({ ok: false });
    expect(mocks.report).toHaveBeenCalledOnce();
  });
});
