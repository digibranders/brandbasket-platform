import { AccountAlreadyExistsError, createVerifiedEmailAccountWithGrant } from "@brandbasket/auth";
import { BreachCheckUnavailableError, breachedPasswordCount } from "@brandbasket/auth/breached-password";
import { addStaffMember, claimStaffInvite, consumeRateLimit, findUserIdByEmail, findUsableStaffInvite } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";
import { getSessionUser } from "./session";
import { acceptStaffInvite, viewStaffInvite } from "./staff-invite-accept";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.7" })) }));
vi.mock("@brandbasket/auth", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/auth")>("@brandbasket/auth");
  return { ...actual, createVerifiedEmailAccountWithGrant: vi.fn() };
});
vi.mock("@brandbasket/auth/breached-password", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/auth/breached-password")>("@brandbasket/auth/breached-password");
  return { ...actual, breachedPasswordCount: vi.fn() };
});
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, addStaffMember: vi.fn(), claimStaffInvite: vi.fn(), consumeRateLimit: vi.fn(), findUserIdByEmail: vi.fn(), findUsableStaffInvite: vi.fn() };
});
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({ name: "staff-db" })) }));
vi.mock("./auth", () => ({ getAuth: vi.fn() }));
vi.mock("./session", () => ({ getSessionUser: vi.fn() }));

const INVITE = { id: "inv-1", email: "nikhil@brandbasket.in", role: "support" as const, expiresAt: new Date("2026-12-03T09:00:00Z"), invitedBy: "riya", createdAt: new Date() };
const signInEmail = vi.fn();
const FORM = { name: "Nikhil Jain", password: "a-long-pass-7!" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as Awaited<ReturnType<typeof consumeRateLimit>>);
  vi.mocked(findUsableStaffInvite).mockResolvedValue(INVITE);
  vi.mocked(getSessionUser).mockResolvedValue(null);
  vi.mocked(findUserIdByEmail).mockResolvedValue(null);
  vi.mocked(breachedPasswordCount).mockResolvedValue(0);
  vi.mocked(createVerifiedEmailAccountWithGrant).mockResolvedValue({ userId: "new-user", email: INVITE.email });
  vi.mocked(claimStaffInvite).mockResolvedValue(true);
  vi.mocked(getAuth).mockReturnValue({ api: { signInEmail } } as unknown as ReturnType<typeof getAuth>);
});

describe("viewStaffInvite", () => {
  it("is limited per network", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 120 } as Awaited<ReturnType<typeof consumeRateLimit>>);
    expect(await viewStaffInvite("tok")).toEqual({ kind: "limited", retryAfterSeconds: 120 });
    expect(findUsableStaffInvite).not.toHaveBeenCalled();
  });

  it("says when the link is gone", async () => {
    vi.mocked(findUsableStaffInvite).mockResolvedValue(null);
    expect(await viewStaffInvite("tok")).toEqual({ kind: "gone" });
  });

  it("knows whether to ask for a password, a sign-in, or nothing", async () => {
    expect(await viewStaffInvite("tok")).toMatchObject({ kind: "ready", mode: "create" });
    vi.mocked(findUserIdByEmail).mockResolvedValue("existing");
    expect(await viewStaffInvite("tok")).toMatchObject({ kind: "ready", mode: "sign-in-first" });
    vi.mocked(getSessionUser).mockResolvedValue({ id: "existing", email: "Nikhil@BrandBasket.in", name: "Nikhil" } as Awaited<ReturnType<typeof getSessionUser>>);
    expect(await viewStaffInvite("tok")).toMatchObject({ kind: "ready", mode: "join" });
    vi.mocked(getSessionUser).mockResolvedValue({ id: "other", email: "someone@else.in", name: "Other" } as Awaited<ReturnType<typeof getSessionUser>>);
    expect(await viewStaffInvite("tok")).toMatchObject({ kind: "ready", mode: "wrong-account" });
  });
});

describe("acceptStaffInvite", () => {
  it("creates a verified account, claims the invite, adds the staff row and signs them in", async () => {
    expect(await acceptStaffInvite("tok", FORM)).toEqual({ status: "joined" });
    expect(createVerifiedEmailAccountWithGrant).toHaveBeenCalledWith(expect.anything(), { name: "staff-db" }, { email: INVITE.email, name: "Nikhil Jain", password: "a-long-pass-7!" });
    expect(claimStaffInvite).toHaveBeenCalledWith({ name: "staff-db" }, "inv-1");
    expect(addStaffMember).toHaveBeenCalledWith({ name: "staff-db" }, { userId: "new-user", role: "support" });
    expect(signInEmail).toHaveBeenCalledWith(expect.objectContaining({ body: { email: INVITE.email, password: "a-long-pass-7!" } }));
  });

  it("lets a signed-in owner of the address join without a password", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "existing", email: INVITE.email, name: "Nikhil" } as Awaited<ReturnType<typeof getSessionUser>>);
    expect(await acceptStaffInvite("tok", null)).toEqual({ status: "joined" });
    expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
    expect(addStaffMember).toHaveBeenCalledWith({ name: "staff-db" }, { userId: "existing", role: "support" });
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("is limited per network before looking at the token", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 600 } as Awaited<ReturnType<typeof consumeRateLimit>>);
    expect((await acceptStaffInvite("tok", FORM)).status).toBe("error");
    expect(findUsableStaffInvite).not.toHaveBeenCalled();
  });

  it("refuses another signed-in account and an address that already has one", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "other", email: "someone@else.in", name: "Other" } as Awaited<ReturnType<typeof getSessionUser>>);
    expect(await acceptStaffInvite("tok", FORM)).toMatchObject({ status: "error" });
    vi.mocked(getSessionUser).mockResolvedValue(null);
    vi.mocked(findUserIdByEmail).mockResolvedValue("existing");
    expect(await acceptStaffInvite("tok", FORM)).toMatchObject({ status: "error" });
    expect(addStaffMember).not.toHaveBeenCalled();
  });

  it("refuses a breached password, and fails closed when the check is down", async () => {
    vi.mocked(breachedPasswordCount).mockResolvedValue(42);
    expect(await acceptStaffInvite("tok", FORM)).toMatchObject({ status: "error", field: "password" });
    vi.mocked(breachedPasswordCount).mockRejectedValue(new BreachCheckUnavailableError("The breach check is down."));
    expect(await acceptStaffInvite("tok", FORM)).toMatchObject({ status: "error", field: "password" });
    expect(createVerifiedEmailAccountWithGrant).not.toHaveBeenCalled();
  });

  it("adds nobody when the invite was claimed first by another tab", async () => {
    vi.mocked(claimStaffInvite).mockResolvedValue(false);
    expect(await acceptStaffInvite("tok", FORM)).toMatchObject({ status: "error" });
    expect(addStaffMember).not.toHaveBeenCalled();
  });

  it("treats an account made in between as already existing", async () => {
    vi.mocked(createVerifiedEmailAccountWithGrant).mockRejectedValue(new AccountAlreadyExistsError(INVITE.email));
    expect(await acceptStaffInvite("tok", FORM)).toMatchObject({ status: "error" });
    expect(claimStaffInvite).not.toHaveBeenCalled();
  });
});
