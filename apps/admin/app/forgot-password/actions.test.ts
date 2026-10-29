import { beforeEach, expect, it, vi } from "vitest";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { requestStaffPasswordReset } from "@/lib/server/account-recovery";
import { requestPasswordResetAction } from "./actions";

vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn() }));
vi.mock("@/lib/server/account-recovery", () => ({ requestStaffPasswordReset: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkHuman).mockResolvedValue({ ok: true });
  vi.mocked(requestStaffPasswordReset).mockResolvedValue("accepted");
});

it("checks the robot token before recovery and retains the address", async () => {
  const data = new FormData();
  data.set("email", " Staff@Example.com ");
  vi.mocked(checkHuman).mockResolvedValue({ ok: false, message: "Try the robot check again." });
  expect(await requestPasswordResetAction({ status: "idle" }, data)).toEqual({ status: "error", message: "Try the robot check again.", email: "staff@example.com" });
  expect(requestStaffPasswordReset).not.toHaveBeenCalled();
});

it("normalises a valid address and shows neutral success", async () => {
  const data = new FormData();
  data.set("email", " Staff@Example.com ");
  expect(await requestPasswordResetAction({ status: "idle" }, data)).toEqual({ status: "sent", email: "staff@example.com" });
  expect(checkHuman).toHaveBeenCalledWith(data, "staff_forgot_password");
  expect(requestStaffPasswordReset).toHaveBeenCalledWith("staff@example.com");
});

it("rejects an invalid email before issuing a token", async () => {
  expect(await requestPasswordResetAction({ status: "idle" }, new FormData())).toMatchObject({ status: "error" });
  expect(requestStaffPasswordReset).not.toHaveBeenCalled();
});

it.each(["limited", "failed"] as const)("shows a retryable error for %s", async (outcome) => {
  const data = new FormData();
  data.set("email", "staff@example.com");
  vi.mocked(requestStaffPasswordReset).mockResolvedValue(outcome);
  expect(await requestPasswordResetAction({ status: "idle" }, data)).toMatchObject({ status: "error", email: "staff@example.com" });
});
