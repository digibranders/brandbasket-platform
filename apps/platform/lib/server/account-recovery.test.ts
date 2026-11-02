import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, findUserByPhone, type Database, type RecordedEmail } from "@brandbasket/db";
import { passwordResetEmail } from "@brandbasket/email";
import { after } from "next/server";
import { requestPasswordReset } from "./account-recovery";
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
  ...await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db"), consumeRateLimit: vi.fn(), findUserByPhone: vi.fn(),
}));

const committed: RecordedEmail[] = [];
const insert = vi.fn();
const send = vi.fn(async () => undefined);
const EMAIL = { kind: "email", email: "owner@example.com" } as const;
const PHONE = { kind: "phone", phone: "+919820011223" } as const;
const PLACEHOLDER = "919820011223@phone.brandbasket.invalid";
const message = passwordResetEmail({ to: "owner@example.com", resetUrl: "https://app.brandbasket.in/reset-password/real-token", expiresInMinutes: 60 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  committed.length = 0;
  vi.mocked(getAppDb).mockReturnValue({} as Database);
  vi.mocked(getAuth).mockReturnValue({ api: {} } as unknown as ReturnType<typeof getAuth>);
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

describe("reset mail delivery", () => {
  it.each([true, false])("returns the same delivery fault with a failing outbox (account=%s)", async (exists) => {
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(exists ? message : null);
    insert.mockRejectedValue(new Error("outbox insert unavailable"));
    expect(await requestPasswordReset(EMAIL)).toEqual("failed");
    expect(insert).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
  });

  it("commits the outbox copy of a real reset, without its link", async () => {
    expect(await requestPasswordReset(EMAIL)).toBe("accepted");
    expect(committed).toMatchObject([{ toAddress: message.to, bodyText: message.outboxCopy?.bodyText }]);
    expect(committed[0]?.bodyText).not.toContain("real-token");
  });

  it("delivers a real reset only after the response is sent", async () => {
    expect(await requestPasswordReset(EMAIL)).toBe("accepted");
    expect(send).not.toHaveBeenCalled();
    expect(after).toHaveBeenCalledTimes(1);
    const task = vi.mocked(after).mock.calls[0]?.[0];
    if (typeof task !== "function") throw new Error("Expected after() to be given a function");
    await task();
    expect(send).toHaveBeenCalledWith(message);
  });

  it("schedules no delivery for an address without an account", async () => {
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(null);
    expect(await requestPasswordReset({ kind: "email", email: "nobody@example.com" })).toBe("accepted");
    expect(after).not.toHaveBeenCalled();
  });

  it("uses the same outbox insert for an absent account but rolls it back", async () => {
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(null);
    expect(await requestPasswordReset({ kind: "email", email: "absent@example.com" })).toBe("accepted");
    expect(insert).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
  });
});

describe("reset by mobile number", () => {
  const budgetKeys = (): string[] => vi.mocked(consumeRateLimit).mock.calls.map((call) => call[1]);

  it("emails the reset link to the address on the account the number belongs to", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-1", name: "Meera", email: "owner@example.com" });
    expect(await requestPasswordReset(PHONE)).toBe("accepted");
    expect(generatePasswordResetEmail).toHaveBeenCalledWith("owner@example.com");
    expect(committed).toMatchObject([{ toAddress: message.to }]);
    expect(after).toHaveBeenCalledTimes(1);
    expect(budgetKeys()).toEqual([
      "password-reset:client:203.0.113.9",
      "password-reset:phone:+919820011223",
      "password-reset:email:owner@example.com",
    ]);
  });

  it("takes the same steps for a number with no account, and sends nothing", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue(null);
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(null);
    expect(await requestPasswordReset(PHONE)).toBe("accepted");
    expect(generatePasswordResetEmail).toHaveBeenCalledWith("no-account@phone.brandbasket.invalid");
    expect(insert).toHaveBeenCalledOnce();
    expect(committed).toEqual([]);
    expect(after).not.toHaveBeenCalled();
    expect(budgetKeys()).toEqual([
      "password-reset:client:203.0.113.9",
      "password-reset:phone:+919820011223",
      `password-reset:email:${PLACEHOLDER}`,
    ]);
  });

  it("writes to nobody for an account that holds only a placeholder address", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-2", name: "Asha", email: PLACEHOLDER });
    vi.mocked(generatePasswordResetEmail).mockResolvedValue(null);
    expect(await requestPasswordReset(PHONE)).toBe("accepted");
    expect(generatePasswordResetEmail).toHaveBeenCalledWith("no-account@phone.brandbasket.invalid");
    expect(after).not.toHaveBeenCalled();
  });

  it("answers a number over its own hourly budget like any other request, and sends nothing", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-1", name: "Meera", email: "owner@example.com" });
    vi.mocked(consumeRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    expect(await requestPasswordReset(PHONE)).toBe("accepted");
    expect(generatePasswordResetEmail).not.toHaveBeenCalled();
  });

  it("holds the account's address budget too, so alternating between its email and its number does not double it", async () => {
    vi.mocked(findUserByPhone).mockResolvedValue({ id: "user-1", name: "Meera", email: "owner@example.com" });
    vi.mocked(consumeRateLimit)
      .mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, remaining: 1, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    expect(await requestPasswordReset(PHONE)).toBe("accepted");
    expect(generatePasswordResetEmail).not.toHaveBeenCalled();
  });

  it("tells a network over its budget to wait, whatever it asked about", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    expect(await requestPasswordReset(PHONE)).toBe("limited");
    expect(findUserByPhone).not.toHaveBeenCalled();
  });
});
