import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, type Database, type RecordedEmail } from "@brandbasket/db";
import { passwordResetEmail } from "@brandbasket/email";
import { after } from "next/server";
import { confirmEmail, requestPasswordReset } from "./account-recovery";
import { generatePasswordResetEmail, getAuth } from "./auth";
import { getAppDb } from "./db";
import { getPublicDb } from "./public-db";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "203.0.113.9" })) }));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./public-db", () => ({ getPublicDb: vi.fn() }));
vi.mock("./auth", () => ({ getAuth: vi.fn(), generatePasswordResetEmail: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./email", () => ({ realDeployment: vi.fn(() => true) }));
vi.mock("@brandbasket/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/email")>()),
  createEmailDelivery: vi.fn(() => ({ send })),
}));
vi.mock("@brandbasket/db", async () => ({
  ...await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db"), consumeRateLimit: vi.fn(),
}));

function apiError(code: string): Error & { body: { code: string } } {
  return Object.assign(new Error("Auth request failed"), { name: "APIError", body: { code } });
}

const verifyEmail = vi.fn();
const committed: RecordedEmail[] = [];
const insert = vi.fn();
const send = vi.fn(async () => undefined);
const message = passwordResetEmail({ to: "owner@example.com", resetUrl: "https://app.brandbasket.in/reset-password/real-token", expiresInMinutes: 60 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  committed.length = 0;
  vi.mocked(getAppDb).mockReturnValue({} as Database);
  vi.mocked(getAuth).mockReturnValue({ api: { verifyEmail } } as unknown as ReturnType<typeof getAuth>);
  verifyEmail.mockResolvedValue(undefined);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(generatePasswordResetEmail).mockResolvedValue(message);
  insert.mockImplementation(async () => undefined);
  vi.mocked(getPublicDb).mockReturnValue({
    transaction: async (run: (db: Database) => Promise<void>) => {
      const pending: RecordedEmail[] = [];
      const tx = { insert: () => ({ values: async (row: RecordedEmail) => { await insert(row); pending.push(row); } }) };
      await run(tx as unknown as Database);
      committed.push(...pending);
    },
  } as unknown as Database);
});

describe("confirmation outcomes", () => {
  it("keeps a temporary budget separate from a dead token", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 137 });
    expect(await confirmEmail("usable-token")).toEqual({ kind: "limited", retryAfterSeconds: 137 });
    expect(verifyEmail).not.toHaveBeenCalled();
  });

  it.each(["INVALID_TOKEN", "TOKEN_EXPIRED", "USER_NOT_FOUND"])("recognizes %s as a dead confirmation", async (code) => {
    verifyEmail.mockRejectedValue(apiError(code));
    expect(await confirmEmail("bad-token")).toEqual({ kind: "dead-link" });
  });

  it.each([apiError("DATABASE_UNAVAILABLE"), new Error("connection down")])(
    "retains retry for unexpected confirmation fault %s", async (error) => {
      verifyEmail.mockRejectedValue(error);
      expect(await confirmEmail("usable-token")).toEqual({ kind: "failed" });
    });
});

describe("reset mail delivery", () => {
  it.each([true, false])("returns the same delivery fault with a failing outbox (account=%s)", async (exists) => {
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(exists ? message : null);
    insert.mockRejectedValue(new Error("outbox insert unavailable"));
    expect(await requestPasswordReset("owner@example.com")).toEqual("failed");
    expect(insert).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
  });

  it("commits the outbox copy of a real reset, without its link", async () => {
    expect(await requestPasswordReset("owner@example.com")).toBe("accepted");
    expect(committed).toMatchObject([{ toAddress: message.to, bodyText: message.outboxCopy?.bodyText }]);
    expect(committed[0]?.bodyText).not.toContain("real-token");
  });

  it("delivers a real reset only after the response is sent", async () => {
    expect(await requestPasswordReset("owner@example.com")).toBe("accepted");
    expect(send).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    const task = vi.mocked(after).mock.calls[0]?.[0];
    if (typeof task !== "function") throw new Error("Expected after() to be given a function");
    await task();
    expect(send).toHaveBeenCalledWith(message);
  });

  it("schedules no delivery for an address without an account", async () => {
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(null);
    expect(await requestPasswordReset("nobody@example.com")).toBe("accepted");
    expect(after).not.toHaveBeenCalled();
  });

  it("uses the same outbox insert for an absent account but rolls it back", async () => {
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(null);
    expect(await requestPasswordReset("absent@example.com")).toBe("accepted");
    expect(insert).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
  });
});
