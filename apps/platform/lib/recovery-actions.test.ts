import { beforeEach, expect, it, vi } from "vitest";
import { requestPasswordResetAction } from "@/app/app-host/forgot-password/actions";
import { requestPasswordReset } from "@/lib/server/account-recovery";

vi.mock("@/lib/server/account-recovery", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn(async () => ({ ok: true })) }));
vi.mock("server-only", () => ({}));

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}
beforeEach(() => vi.clearAllMocks());

it("returns a neutral retryable email delivery error instead of the sent stage", async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue("failed");
  const result = await requestPasswordResetAction({ status: "idle" }, form({ identifier: "owner@example.com" }));
  expect(result).toMatchObject({ status: "error" });
  expect(result.status === "error" ? result.message : "").toContain("try again");
  expect(result.status === "error" ? result.message : "").not.toContain("account");
});

it("says the same thing whether or not the address has an account, and sends the reset link to the lowercased address", async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue("accepted");
  expect(await requestPasswordResetAction({ status: "idle" }, form({ identifier: " Owner@Example.COM " }))).toEqual({ status: "sent", kind: "email", typed: "owner@example.com" });
  expect(requestPasswordReset).toHaveBeenCalledWith({ kind: "email", email: "owner@example.com" });
});

it("takes a mobile number as E.164, and answers with the number as typed", async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue("accepted");
  expect(await requestPasswordResetAction({ status: "idle" }, form({ identifier: " 98200 11223 " }))).toEqual({ status: "sent", kind: "phone", typed: "98200 11223" });
  expect(requestPasswordReset).toHaveBeenCalledWith({ kind: "phone", phone: "+919820011223" });
});

it("tells a network over its hourly budget to wait", async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue("limited");
  expect(await requestPasswordResetAction({ status: "idle" }, form({ identifier: "owner@example.com" }))).toEqual({
    status: "error",
    message: "Too many requests from this network. Try again in an hour.",
  });
});

it("asks for an email or a mobile number, and sends nothing for anything else", async () => {
  for (const identifier of ["", "12345", "not an address", "meera@"]) {
    const result = await requestPasswordResetAction({ status: "idle" }, form({ identifier }));
    expect(result).toMatchObject({ status: "error" });
    expect(result.status === "error" ? result.message : "").toMatch(/email/i);
  }
  expect(requestPasswordReset).not.toHaveBeenCalled();
});
