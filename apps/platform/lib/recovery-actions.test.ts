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
  expect(await requestPasswordResetAction({ status: "idle" }, form({ identifier: " Owner@Example.COM " }))).toEqual({ status: "sent", email: "owner@example.com" });
  expect(requestPasswordReset).toHaveBeenCalledWith("owner@example.com");
});

it("tells a network over its hourly budget to wait", async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue("limited");
  expect(await requestPasswordResetAction({ status: "idle" }, form({ identifier: "owner@example.com" }))).toEqual({
    status: "error",
    message: "Too many requests from this network. Try again in an hour.",
  });
});

it("asks for an email address, and never sends a code or a link for a mobile number", async () => {
  for (const identifier of ["", "9820000000", "not an address"]) {
    const result = await requestPasswordResetAction({ status: "idle" }, form({ identifier }));
    expect(result).toMatchObject({ status: "error" });
    expect(result.status === "error" ? result.message : "").toMatch(/email/i);
  }
  expect(requestPasswordReset).not.toHaveBeenCalled();
});
