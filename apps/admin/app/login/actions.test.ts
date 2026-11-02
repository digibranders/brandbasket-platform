import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { finishSignIn, signInWithPassword } from "@/lib/server/sign-in";
import { confirmStaffCode, signInStaff } from "./actions";

vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirect"); }) }));
vi.mock("@/lib/server/sign-in", () => ({ signInWithPassword: vi.fn(), finishSignIn: vi.fn() }));

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInStaff", () => {
  it("refuses a staff sign-in that fails the robot check, before it looks at the password", async () => {
    vi.mocked(checkHuman).mockResolvedValue({ ok: false, message: "The robot check did not pass. Reload the page and try again." });
    const result = await signInStaff({ status: "idle" }, form({ email: " asha@brandbasket.in ", password: "x" }));
    expect(result).toEqual({ status: "error", message: "The robot check did not pass. Reload the page and try again.", email: "asha@brandbasket.in" });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "staff_sign_in");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("goes on to the password when the robot check passes", async () => {
    vi.mocked(checkHuman).mockResolvedValue({ ok: true });
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "error", message: "Wrong password.", email: "asha@brandbasket.in" });
    const result = await signInStaff({ status: "idle" }, form({ email: "asha@brandbasket.in", password: "x" }));
    expect(result).toMatchObject({ status: "error", message: "Wrong password." });
    expect(signInWithPassword).toHaveBeenCalledOnce();
  });
});

describe("signInStaff, once the password was right", () => {
  it("hands the code step back and does not redirect", async () => {
    vi.mocked(checkHuman).mockResolvedValue({ ok: true });
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "code", email: "asha@brandbasket.in", otpId: "id-1" });
    expect(await signInStaff({ status: "idle" }, form({ email: "asha@brandbasket.in", password: "x" }))).toEqual({ status: "code", email: "asha@brandbasket.in", otpId: "id-1" });
  });
});

describe("confirmStaffCode", () => {
  it("redirects into the console only once the code finished the sign-in", async () => {
    vi.mocked(finishSignIn).mockResolvedValue({ status: "signed-in" });
    await expect(confirmStaffCode({ status: "idle" }, form({ otpId: "id-1", code: "482913" }))).rejects.toThrow("redirect");
  });

  it("stays on the code step with the reason when the code is refused", async () => {
    vi.mocked(finishSignIn).mockResolvedValue({ status: "error", message: "That code isn’t right. 4 tries left.", restart: false });
    expect(await confirmStaffCode({ status: "idle" }, form({ otpId: "id-1", code: "000000" }))).toEqual({ status: "error", message: "That code isn’t right. 4 tries left.", restart: false });
  });
});
