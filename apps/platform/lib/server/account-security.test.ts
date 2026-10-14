import { beforeEach, describe, expect, it, vi } from "vitest";
import { changePasswordFor, revokeOtherSessionsFor } from "./account-security";

const mocks = vi.hoisted(() => ({
  budget: vi.fn(), changePassword: vi.fn(), revokeOtherSessions: vi.fn(), report: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@fynix/auth", () => ({ isWrongPasswordError: (error: unknown) => error instanceof Error && error.message === "wrong password" }));
vi.mock("@fynix/db", () => ({ consumeRateLimit: mocks.budget }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ cookie: "current-session" })) }));
vi.mock("./auth", () => ({ getAuth: () => ({ api: { changePassword: mocks.changePassword, revokeOtherSessions: mocks.revokeOtherSessions } }) }));
vi.mock("./db", () => ({ getAppDb: () => ({}) }));
vi.mock("./error-report", () => ({ reportServerError: mocks.report }));
const INPUT = { currentPassword: "current-password", newPassword: "new-password" };
beforeEach(() => { vi.resetAllMocks(); mocks.budget.mockResolvedValue({ allowed: true }); });

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
