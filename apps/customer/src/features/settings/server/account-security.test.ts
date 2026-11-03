import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePasswordFor, checkPasswordFor, passwordBudgetKey, revokeOtherSessionsFor } from "./account-security";

const mocks = vi.hoisted(() => ({
  budget: vi.fn(),
  changePassword: vi.fn(),
  revokeOtherSessions: vi.fn(),
  verifyPassword: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@brandbasket/auth", () => ({ isWrongPasswordError: (error: unknown) => error instanceof Error && error.message === "wrong password" }));
vi.mock("@brandbasket/db", () => ({ consumeRateLimit: mocks.budget }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ cookie: "current-session" })) }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { changePassword: mocks.changePassword, revokeOtherSessions: mocks.revokeOtherSessions, verifyPassword: mocks.verifyPassword } }),
}));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({}) }));
vi.mock("@/lib/report", () => ({ reportError: mocks.report }));

const INPUT = { currentPassword: "current-password", newPassword: "new-password" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.budget.mockResolvedValue({ allowed: true });
});

describe("changePasswordFor", () => {
  it("reports a successful password change truthfully when revocation fails", async () => {
    mocks.revokeOtherSessions.mockRejectedValue(new Error("session storage unavailable"));
    await expect(changePasswordFor("user-1", INPUT)).resolves.toBe("changed-revoke-failed");
    expect(mocks.changePassword).toHaveBeenCalledOnce();
    expect(mocks.report).toHaveBeenCalledOnce();
  });

  it("retains the current session and revokes other sessions on success", async () => {
    expect(await changePasswordFor("user-1", INPUT)).toBe("changed");
    expect(mocks.changePassword).toHaveBeenCalledWith({ body: INPUT, headers: expect.any(Headers) });
    expect(mocks.revokeOtherSessions).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("does not revoke sessions or claim success with a wrong password", async () => {
    mocks.changePassword.mockRejectedValue(new Error("wrong password"));
    expect(await changePasswordFor("user-1", INPUT)).toBe("wrong-password");
    expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
  });

  it("does not hide a real fault as a wrong password", async () => {
    mocks.changePassword.mockRejectedValue(new Error("database down"));
    await expect(changePasswordFor("user-1", INPUT)).rejects.toThrow("database down");
  });

  it("does not mutate when the password attempt budget is spent", async () => {
    mocks.budget.mockResolvedValue({ allowed: false });
    expect(await changePasswordFor("user-1", INPUT)).toBe("limited");
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });
});

describe("revokeOtherSessionsFor", () => {
  it("retries only session revocation with the current session", async () => {
    expect(await revokeOtherSessionsFor("user-1")).toBe("revoked");
    expect(mocks.changePassword).not.toHaveBeenCalled();
    expect(mocks.revokeOtherSessions).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });

  it("returns a retryable outcome if revocation still fails", async () => {
    mocks.revokeOtherSessions.mockRejectedValue(new Error("session storage unavailable"));
    expect(await revokeOtherSessionsFor("user-1")).toBe("failed");
    expect(mocks.changePassword).not.toHaveBeenCalled();
  });

  it("limits repeated revocation attempts independently from password guesses", async () => {
    mocks.budget.mockResolvedValue({ allowed: false });
    expect(await revokeOtherSessionsFor("user-1")).toBe("limited");
    expect(mocks.revokeOtherSessions).not.toHaveBeenCalled();
    expect(mocks.budget).toHaveBeenCalledWith(expect.anything(), "revoke-other-sessions:user:user-1", expect.anything());
  });
});

describe("the shared password guess budget", () => {
  it("is one key, 8 an hour, for changing the password and for checking it (which delete uses)", async () => {
    await changePasswordFor("user-1", INPUT);
    await checkPasswordFor("user-1", "a-password");
    const keys = mocks.budget.mock.calls.map(([, key]) => key);
    expect(keys).toEqual(["change-password:user:user-1", "change-password:user:user-1"]);
    expect(passwordBudgetKey("user-1")).toBe("change-password:user:user-1");
    for (const [, , rule] of mocks.budget.mock.calls) expect(rule).toEqual({ limit: 8, windowSeconds: 3600 });
  });
});

describe("checkPasswordFor", () => {
  it("says correct, wrong or limited, and never asks Better Auth once the budget is spent", async () => {
    await expect(checkPasswordFor("user-1", "right")).resolves.toBe("correct");
    mocks.verifyPassword.mockRejectedValueOnce(new Error("wrong password"));
    await expect(checkPasswordFor("user-1", "wrong")).resolves.toBe("wrong-password");
    mocks.budget.mockResolvedValue({ allowed: false });
    mocks.verifyPassword.mockClear();
    await expect(checkPasswordFor("user-1", "right")).resolves.toBe("limited");
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });
});
