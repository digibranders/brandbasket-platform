import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePasswordAction, clearNomineeAction, deleteAccountAction, revokeOtherSessionsAction, saveNomineeAction, saveProfileAction, setNotificationAction } from "./actions";

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirected to ${to}`);
  }
}

const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn(),
  requireOwner: vi.fn(),
  updateUser: vi.fn(),
  revokeSessions: vi.fn(),
  changePasswordFor: vi.fn(),
  revokeOtherSessionsFor: vi.fn(),
  closeAccountFor: vi.fn(),
  setPreference: vi.fn(),
  saveNominee: vi.fn(),
  clearNominee: vi.fn(),
  withTenantScope: vi.fn(),
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
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ cookie: "session" })) }));
vi.mock("@brandbasket/db", () => ({
  NOTIFICATION_TOPICS: ["new_enquiry", "needs_approval", "request_reply", "billing", "monthly_report", "product_news"],
  saveNominee: mocks.saveNominee,
  clearNominee: mocks.clearNominee,
  setNotificationPreference: mocks.setPreference,
  withTenantScope: mocks.withTenantScope,
}));
vi.mock("@/lib/guards", () => ({ requireCustomer: mocks.requireCustomer, requireOwner: mocks.requireOwner }));
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ api: { updateUser: mocks.updateUser, revokeSessions: mocks.revokeSessions } }) }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app" }) }));
vi.mock("@/lib/report", () => ({ reportError: mocks.report }));
vi.mock("./server/account-security", () => ({ changePasswordFor: mocks.changePasswordFor, revokeOtherSessionsFor: mocks.revokeOtherSessionsFor }));
vi.mock("./server/account-exit", () => ({ closeAccountFor: mocks.closeAccountFor }));

const TENANT = { userId: "session-user", businessId: "0198f2c0-0000-7000-8000-000000000001", businessName: "Apex", role: "owner" };
const CUSTOMER = { user: { id: "session-user", phone: null }, tenant: TENANT, role: "owner" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireCustomer.mockResolvedValue(CUSTOMER);
  mocks.requireOwner.mockResolvedValue(CUSTOMER);
  mocks.withTenantScope.mockImplementation(async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({ name: "tx" }));
});

describe("saveProfileAction", () => {
  it("asks for a signed-in member, refuses a blank name and writes nothing", async () => {
    const result = await saveProfileAction(form({ name: "   " }));
    expect(mocks.requireCustomer).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ ok: false, fieldErrors: { name: "Tell us your name." } });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("changes the name and nothing else, whatever else the form carries", async () => {
    const result = await saveProfileAction(form({ name: " Anand Verma ", email: "someone@else.com", phoneNumber: "+919800000000", userId: "attacker" }));
    expect(result).toEqual({ ok: true });
    expect(mocks.updateUser).toHaveBeenCalledWith({ body: { name: "Anand Verma" }, headers: expect.any(Headers) });
  });

  it("says so in words, and reports, when Better Auth fails", async () => {
    mocks.updateUser.mockRejectedValue(new Error("down"));
    const result = await saveProfileAction(form({ name: "Anand" }));
    expect(result).toMatchObject({ ok: false, message: "We could not save that. Try again in a moment." });
    expect(mocks.report).toHaveBeenCalledOnce();
  });
});

describe("changePasswordAction", () => {
  const passwords = (extra: Record<string, string> = {}) =>
    form({ currentPassword: "current-password", newPassword: "new-long-password-9!", confirmPassword: "new-long-password-9!", ...extra });

  it("refuses a form that does not pass before it touches the account", async () => {
    const result = await changePasswordAction(passwords({ confirmPassword: "different-9!" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { confirmPassword: "Both new passwords must match." } });
    expect(mocks.changePasswordFor).not.toHaveBeenCalled();
  });

  it("changes the session user's password, never the account a form names", async () => {
    mocks.changePasswordFor.mockResolvedValue("changed");
    const result = await changePasswordAction(passwords({ userId: "attacker-user" }));
    expect(result).toEqual({ ok: true, data: { otherDevicesSignedOut: true } });
    expect(mocks.changePasswordFor).toHaveBeenCalledWith("session-user", { currentPassword: "current-password", newPassword: "new-long-password-9!" });
  });

  it("tells the form the password changed but the other devices are still signed in", async () => {
    mocks.changePasswordFor.mockResolvedValue("changed-revoke-failed");
    expect(await changePasswordAction(passwords())).toEqual({ ok: true, data: { otherDevicesSignedOut: false } });
  });

  it("maps a wrong current password to its field and a spent budget to a plain message", async () => {
    mocks.changePasswordFor.mockResolvedValue("wrong-password");
    expect(await changePasswordAction(passwords())).toMatchObject({ ok: false, message: "That isn’t your current password.", fieldErrors: { currentPassword: "That isn’t your current password." } });
    mocks.changePasswordFor.mockResolvedValue("limited");
    expect(await changePasswordAction(passwords())).toEqual({ ok: false, message: "Too many tries. Please wait a while and try again." });
  });
});

describe("revokeOtherSessionsAction", () => {
  it("revokes only for the authenticated account and accepts no credentials", async () => {
    mocks.revokeOtherSessionsFor.mockResolvedValue("revoked");
    expect(await revokeOtherSessionsAction()).toEqual({ ok: true });
    expect(mocks.revokeOtherSessionsFor).toHaveBeenCalledWith("session-user");
    expect(mocks.changePasswordFor).not.toHaveBeenCalled();
  });

  it.each(["limited", "failed"])("keeps the retry message truthful for %s", async (outcome) => {
    mocks.revokeOtherSessionsFor.mockResolvedValue(outcome);
    expect(await revokeOtherSessionsAction()).toMatchObject({ ok: false, message: expect.any(String) });
  });
});

describe("setNotificationAction", () => {
  it("stores the person's own choice for their business, from the session", async () => {
    expect(await setNotificationAction("billing", false)).toEqual({ ok: true });
    expect(mocks.withTenantScope).toHaveBeenCalledWith({ name: "app" }, TENANT, expect.any(Function));
    expect(mocks.setPreference).toHaveBeenCalledWith({ name: "tx" }, "session-user", "billing", false);
  });

  it("refuses a topic that does not exist and a value that is not a switch position", async () => {
    expect(await setNotificationAction("whatsapp_everything", true)).toMatchObject({ ok: false });
    expect(await setNotificationAction("billing", "yes" as unknown as boolean)).toMatchObject({ ok: false });
    expect(mocks.setPreference).not.toHaveBeenCalled();
  });

  it("says so, and reports, when the write fails", async () => {
    mocks.setPreference.mockRejectedValue(new Error("down"));
    expect(await setNotificationAction("billing", true)).toMatchObject({ ok: false });
    expect(mocks.report).toHaveBeenCalledOnce();
  });
});

describe("the nominee actions", () => {
  it("name the nominee for the session user, whatever user id the form carries", async () => {
    const result = await saveNomineeAction(form({ name: "Meera Rao", phone: "98765 43210", userId: "attacker" }));
    expect(result).toEqual({ ok: true });
    expect(mocks.saveNominee).toHaveBeenCalledWith({ name: "app" }, "session-user", { name: "Meera Rao", phone: "+919876543210" });
  });

  it("refuse the account's own number, naming the field", async () => {
    mocks.requireCustomer.mockResolvedValue({ ...CUSTOMER, user: { id: "session-user", phone: "+919876543210" } });
    const result = await saveNomineeAction(form({ name: "Me", phone: "98765 43210" }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { phone: expect.stringContaining("Name someone else") } });
    expect(mocks.saveNominee).not.toHaveBeenCalled();
  });

  it("refuse a number that is not a number", async () => {
    expect(await saveNomineeAction(form({ name: "Meera", phone: "12345" }))).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });
    expect(mocks.saveNominee).not.toHaveBeenCalled();
  });

  it("clear only the session user's nominee and take no input", async () => {
    expect(await clearNomineeAction()).toEqual({ ok: true });
    expect(mocks.clearNominee).toHaveBeenCalledWith({ name: "app" }, "session-user");
  });
});

describe("deleteAccountAction", () => {
  const valid = { reason: "not_using", comment: "  Too quiet  ", confirmation: "DELETE", password: "my-password-1!" };

  it("is for the owner: an editor or a viewer is sent away by the guard and nothing is closed", async () => {
    mocks.requireOwner.mockRejectedValue(new Redirected("/"));
    await expect(deleteAccountAction(form(valid))).rejects.toThrow(Redirected);
    expect(mocks.closeAccountFor).not.toHaveBeenCalled();
  });

  it("checks the word, the reason and the password before anything is ended", async () => {
    expect(await deleteAccountAction(form({ ...valid, confirmation: "delete" }))).toMatchObject({ ok: false, fieldErrors: { confirmation: expect.any(String) } });
    expect(await deleteAccountAction(form({ ...valid, password: "" }))).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(await deleteAccountAction(form({ ...valid, reason: "" }))).toMatchObject({ ok: false, fieldErrors: { reason: expect.any(String) } });
    expect(mocks.closeAccountFor).not.toHaveBeenCalled();
  });

  it("puts a wrong password on the password field and signs nobody out", async () => {
    mocks.closeAccountFor.mockResolvedValue({ kind: "refused", message: "That isn’t your password. Check it and try again.", field: "password" });
    expect(await deleteAccountAction(form(valid))).toEqual({
      ok: false,
      message: "That isn’t your password. Check it and try again.",
      fieldErrors: { password: "That isn’t your password. Check it and try again." },
    });
    expect(mocks.revokeSessions).not.toHaveBeenCalled();
  });

  it("shows the plain refusal when the provider could not stop the plan", async () => {
    mocks.closeAccountFor.mockResolvedValue({ kind: "refused", message: "We couldn’t end your plan just now.", field: null });
    expect(await deleteAccountAction(form(valid))).toEqual({ ok: false, message: "We couldn’t end your plan just now." });
  });

  it("closes the business of the session with the trimmed reason, signs every device out and lands on sign-in", async () => {
    mocks.closeAccountFor.mockResolvedValue({ kind: "closed" });
    await expect(deleteAccountAction(form(valid))).rejects.toMatchObject({ to: "/login?notice=account-closed" });
    expect(mocks.closeAccountFor).toHaveBeenCalledWith(CUSTOMER, { reason: "not_using", comment: "Too quiet", password: "my-password-1!" }, expect.any(Date));
    expect(mocks.revokeSessions).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("still lands on sign-in when signing the devices out fails, because the closure locks the account itself", async () => {
    mocks.closeAccountFor.mockResolvedValue({ kind: "closed" });
    mocks.revokeSessions.mockRejectedValue(new Error("down"));
    await expect(deleteAccountAction(form(valid))).rejects.toMatchObject({ to: "/login?notice=account-closed" });
    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("explains an unexpected fault in words and reports it", async () => {
    mocks.closeAccountFor.mockRejectedValue(new Error("db down"));
    expect(await deleteAccountAction(form(valid))).toMatchObject({ ok: false, message: expect.stringContaining("Nothing was changed") });
    expect(mocks.report).toHaveBeenCalledOnce();
  });
});
