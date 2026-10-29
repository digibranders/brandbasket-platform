import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, findActiveStaffMember, findActiveStaffUserIdByEmail, type Database } from "@brandbasket/db";
import { createEmailDelivery, createOutboxTransport, passwordResetEmail } from "@brandbasket/email";
import { after } from "next/server";
import { generateStaffPasswordResetEmail, getAuth } from "./auth";
import { realDeployment } from "./email";
import { requestStaffPasswordReset, resetStaffPassword } from "./account-recovery";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }) }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./auth", () => ({ generateStaffPasswordResetEmail: vi.fn(), getAuth: vi.fn() }));
vi.mock("./email", () => ({ realDeployment: vi.fn(() => false) }));
vi.mock("@brandbasket/db", async () => ({
  ...await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db"),
  consumeRateLimit: vi.fn(), findActiveStaffUserIdByEmail: vi.fn(), findActiveStaffMember: vi.fn(),
}));
vi.mock("@brandbasket/email", async () => ({
  ...await vi.importActual<typeof import("@brandbasket/email")>("@brandbasket/email"),
  createEmailDelivery: vi.fn(), createOutboxTransport: vi.fn(),
}));
const { transaction, send, deliver, findVerificationValue, resetPassword } = vi.hoisted(() => ({
  transaction: vi.fn(), send: vi.fn(), deliver: vi.fn(), findVerificationValue: vi.fn(), resetPassword: vi.fn(),
}));
vi.mock("./db", () => ({ getStaffDb: () => ({ transaction }) }));

const message = passwordResetEmail({ to: "staff@example.com", resetUrl: "http://console.brandbasket.localhost:3199/reset-password/token", expiresInMinutes: 60 });

async function finishDelivery(): Promise<void> {
  const callback = vi.mocked(after).mock.calls[0]?.[0];
  if (typeof callback !== "function") throw new Error("Expected a deferred delivery callback.");
  await callback();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
  vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue("staff-1");
  vi.mocked(findActiveStaffMember).mockResolvedValue({ userId: "staff-1", role: "admin" });
  vi.mocked(realDeployment).mockReturnValue(false);
  vi.mocked(generateStaffPasswordResetEmail).mockResolvedValue(message);
  vi.mocked(createEmailDelivery).mockReturnValue(null);
  vi.mocked(createOutboxTransport).mockReturnValue({ send });
  transaction.mockImplementation(async (callback: (db: Database) => Promise<void>) => callback({} as Database));
  send.mockResolvedValue({});
  findVerificationValue.mockResolvedValue({ value: "staff-1", expiresAt: new Date(Date.now() + 60_000) });
  resetPassword.mockResolvedValue({ status: true });
  vi.mocked(getAuth).mockReturnValue({
    $context: Promise.resolve({ internalAdapter: { findVerificationValue } }), api: { resetPassword },
  } as unknown as ReturnType<typeof getAuth>);
});

describe("staff reset requests", () => {
  it("records a real staff reset email in the development outbox", async () => {
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("accepted");
    expect(generateStaffPasswordResetEmail).not.toHaveBeenCalled();
    await finishDelivery();
    expect(send).toHaveBeenCalledWith(message);
    expect(generateStaffPasswordResetEmail).toHaveBeenCalledWith("staff@example.com");
  });

  it("gives the same response for unknown, customer or inactive addresses without minting a token", async () => {
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue(null);
    expect(await requestStaffPasswordReset("customer@example.com")).toBe("accepted");
    await finishDelivery();
    expect(generateStaffPasswordResetEmail).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledOnce();
  });

  it("limits networks and silently limits individual addresses", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("limited");
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("accepted");
    expect(generateStaffPasswordResetEmail).not.toHaveBeenCalled();
  });

  it.each([true, false])("returns a retryable error for an unavailable outbox regardless of membership: %s", async (exists) => {
    vi.mocked(findActiveStaffUserIdByEmail).mockResolvedValue(exists ? "staff-1" : null);
    send.mockRejectedValueOnce(new Error("outbox unavailable"));
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("failed");
  });

  it("refuses to claim email was sent in production without delivery configured", async () => {
    vi.mocked(realDeployment).mockReturnValue(true);
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("failed");
  });

  it("defers real email delivery until after the neutral response", async () => {
    vi.mocked(createEmailDelivery).mockReturnValue({ send: deliver } as unknown as NonNullable<ReturnType<typeof createEmailDelivery>>);
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("accepted");
    expect(deliver).not.toHaveBeenCalled();
    expect(findActiveStaffUserIdByEmail).not.toHaveBeenCalled();
    await finishDelivery();
    expect(deliver).toHaveBeenCalledWith(message);
  });

  it("keeps token-generation failures out of the neutral response", async () => {
    vi.mocked(generateStaffPasswordResetEmail).mockRejectedValueOnce(new Error("token storage unavailable"));
    expect(await requestStaffPasswordReset("staff@example.com")).toBe("accepted");
    await expect(finishDelivery()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("staff reset redemption", () => {
  it("checks staff membership before handing the token to Better Auth", async () => {
    expect(await resetStaffPassword("token", "New-password8!")).toBe("changed");
    expect(findVerificationValue).toHaveBeenCalledWith("reset-password:token");
    expect(findActiveStaffMember).toHaveBeenCalledWith(expect.anything(), "staff-1");
    expect(resetPassword).toHaveBeenCalledWith({ body: { token: "token", newPassword: "New-password8!" } });
  });

  it.each([null, { value: "staff-1", expiresAt: new Date(0) }])("rejects missing and expired tokens", async (verification) => {
    findVerificationValue.mockResolvedValue(verification);
    expect(await resetStaffPassword("token", "New-password8!")).toBe("dead-link");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("rejects a token for a customer or switched-off staff member", async () => {
    vi.mocked(findActiveStaffMember).mockResolvedValue(null);
    expect(await resetStaffPassword("token", "New-password8!")).toBe("dead-link");
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("handles a token consumed by a concurrent request", async () => {
    resetPassword.mockRejectedValue({ name: "APIError", body: { code: "INVALID_TOKEN" } });
    expect(await resetStaffPassword("token", "New-password8!")).toBe("dead-link");
  });

  it("limits reset attempts before looking up a token", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await resetStaffPassword("token", "New-password8!")).toBe("limited");
    expect(findVerificationValue).not.toHaveBeenCalled();
  });

  it("returns a retryable error for infrastructure failures", async () => {
    resetPassword.mockRejectedValueOnce(new Error("database unavailable"));
    expect(await resetStaffPassword("token", "New-password8!")).toBe("failed");
  });
});
