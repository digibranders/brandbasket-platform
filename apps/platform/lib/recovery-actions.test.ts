import { beforeEach, expect, it, vi } from "vitest";
import { requestPasswordResetAction } from "@/app/app-host/forgot-password/actions";
import { requestPasswordReset } from "@/lib/server/account-recovery";
import { requestPhonePasswordReset, resetPasswordWithCode } from "@/lib/server/phone-password-reset";
import type { ForgotPasswordFormState } from "@/lib/account-recovery-form";

vi.mock("@/lib/server/account-recovery", () => ({ requestPasswordReset: vi.fn() }));
vi.mock("@/lib/server/phone-password-reset", async () => ({
  ...await vi.importActual<typeof import("@/lib/server/phone-password-reset")>("@/lib/server/phone-password-reset"),
  requestPhonePasswordReset: vi.fn(), resetPasswordWithCode: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: async () => (await import("@/lib/testing/listing-brand")).LISTING_BRAND }));
const otp = { otpId: "old-code", phoneHint: "••••1234" };
function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}
beforeEach(() => vi.clearAllMocks());

it("returns a neutral retryable email delivery error instead of the sent stage", async () => {
  vi.mocked(requestPasswordReset).mockResolvedValue("failed");
  const result = await requestPasswordResetAction({ status: "idle" }, form({ identifier: "owner@example.com" }));
  expect(result).toMatchObject({ status: "error", otp: null });
  expect(result.status === "error" ? result.message : "").toContain("try again");
  expect(result.status === "error" ? result.message : "").not.toContain("account");
});

it("retains a usable old code and the real send limit when resend is blocked", async () => {
  vi.mocked(requestPhonePasswordReset).mockResolvedValue({ kind: "limited", scope: "global", retryAfterSeconds: 137 });
  const previous: ForgotPasswordFormState = { status: "code", otp };
  expect(await requestPasswordResetAction(previous, form({ identifier: "9820000000", otpId: otp.otpId, resend: "1" })))
    .toMatchObject({ status: "error", otp, retry: { operation: "send", scope: "global", retryAfterSeconds: 137 } });
});

it("retains code confirmation retry timing separately from send cooldown", async () => {
  vi.mocked(resetPasswordWithCode).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 17 });
  expect(await requestPasswordResetAction({ status: "code", otp }, form({
    identifier: "9820000000", otpId: otp.otpId, code: "123456", password: "long-password", confirmPassword: "long-password",
  }))).toMatchObject({ status: "error", otp, retry: { operation: "confirm", scope: "network", retryAfterSeconds: 17 } });
});
