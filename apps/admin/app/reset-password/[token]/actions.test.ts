import { beforeEach, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { resetStaffPassword } from "@/lib/server/account-recovery";
import { resetPasswordAction } from "./actions";

vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn() }));
vi.mock("@/lib/server/account-recovery", () => ({ resetStaffPassword: vi.fn() }));

function form(): FormData {
  const data = new FormData();
  data.set("token", "token");
  data.set("password", "New-password8!");
  data.set("confirmPassword", "New-password8!");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkHuman).mockResolvedValue({ ok: true });
  vi.mocked(resetStaffPassword).mockResolvedValue("changed");
});

it("redirects to sign in with a password-changed notice", async () => {
  await expect(resetPasswordAction({ status: "idle" }, form())).rejects.toThrow("redirect");
  expect(redirect).toHaveBeenCalledWith("/login?notice=password-changed");
  expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "staff_reset_password");
});

it("does not reset a password when the robot check fails", async () => {
  vi.mocked(checkHuman).mockResolvedValue({ ok: false, message: "Robot check failed." });
  expect(await resetPasswordAction({ status: "idle" }, form())).toMatchObject({ status: "error" });
  expect(resetStaffPassword).not.toHaveBeenCalled();
});

it("validates password confirmation on the server", async () => {
  const data = form();
  data.set("confirmPassword", "Different8!");
  expect(await resetPasswordAction({ status: "idle" }, data)).toMatchObject({ status: "error", message: "Both passwords must match." });
  expect(resetStaffPassword).not.toHaveBeenCalled();
});

it.each(["dead-link", "limited", "failed"] as const)("handles %s without redirecting", async (outcome) => {
  vi.mocked(resetStaffPassword).mockResolvedValue(outcome);
  expect(await resetPasswordAction({ status: "idle" }, form())).toMatchObject({ status: outcome === "dead-link" ? "dead-link" : "error" });
  expect(redirect).not.toHaveBeenCalled();
});
