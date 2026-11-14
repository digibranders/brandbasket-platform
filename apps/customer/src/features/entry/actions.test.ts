import { AccountAlreadyExistsError } from "@brandbasket/auth";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { redirect } from "next/navigation";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignUpForm } from "./components/sign-up-form";
import { completeSetupAction, requestPasswordResetAction, resetPasswordAction, signInAction, signUpAction, type SignUpResult } from "./actions";
import { requestPasswordReset, resetPassword } from "./server/account-recovery";
import { landingForSignedInUser } from "./server/entry-access";
import { createListingAccount, requestJoinCode } from "./server/listing-account";
import { redeemSetupInvite, TermsNotAgreedError } from "./server/setup";
import { signInWithPassword } from "./server/sign-in";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));
vi.mock("@brandbasket/shared/server/turnstile-request", () => ({ checkHuman: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAuth: vi.fn() }));
vi.mock("@/features/start/rules", () => ({ startHref: (services: readonly string[]) => `/start?services=${services.join(",")}` }));
vi.mock("./server/account-recovery", () => ({ requestPasswordReset: vi.fn(), resetPassword: vi.fn() }));
vi.mock("./server/entry-access", () => ({ landingForSignedInUser: vi.fn() }));
vi.mock("./server/env", () => ({ leadsApiToken: () => null }));
vi.mock("./server/listing-account", () => ({ requestJoinCode: vi.fn(), createListingAccount: vi.fn() }));
vi.mock("./server/setup", async () => {
  const actual = await vi.importActual<typeof import("./server/setup")>("./server/setup");
  return { ...actual, redeemSetupInvite: vi.fn() };
});
vi.mock("./server/sign-in", () => ({ signInWithPassword: vi.fn() }));
vi.mock("./server/customer-sign-in-form", async () => {
  // The real parser needs the phone library only for numbers; these tests send email addresses.
  const { z } = await import("zod");
  return {
    parseAccountIdentifier: (typed: string) => {
      const email = z.email().safeParse(typed.toLowerCase());
      return email.success ? { success: true, identifier: { kind: "email", email: email.data } } : { success: false, message: "Enter a valid email address or mobile number." };
    },
  };
});

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const SIGN_UP = {
  choice: "managed",
  businessName: "Apex Diagnostics",
  name: "Meera Shah",
  email: "meera@example.test",
  password: "correct-horse-battery-9!",
  country: "IN",
  stateCode: "mh",
  phoneCountry: "IN",
  phone: "9820011223",
  agree: "yes",
  services: "managed-website,paid-ads,nonsense",
};
const INVITE = `/invite/${"A".repeat(43)}`;
const OTHER_NEXT = ["//evil.com", "https://evil.com", `https://evil.com${INVITE}`, "/invite/../x", `${INVITE}/extra`, `${INVITE}?x=1`, "/billing", "/", "", "javascript:alert(1)"];
const OTP = { otpId: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", emailHint: "m•••@example.test", confirmRequired: true };
const ON_CODE: SignUpResult = { ok: true, data: { otp: OTP } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkHuman).mockResolvedValue({ ok: true });
});

describe("signInAction", () => {
  it("runs the robot check first and stops there when it fails", async () => {
    vi.mocked(checkHuman).mockResolvedValue({ ok: false, message: "Please confirm you are not a robot." });
    expect(await signInAction(null, form({ identifier: "a@b.test", password: "x" }))).toEqual({ ok: false, message: "Please confirm you are not a robot." });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "sign_in");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("returns the sign-in's own refusal", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "error", message: "That email and password don’t match an account.", email: "a@b.test" });
    expect(await signInAction(null, form({}))).toEqual({ ok: false, message: "That email and password don’t match an account." });
  });

  it("sends a signed-in person where they land", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "signed-in", userId: "user-1" });
    vi.mocked(landingForSignedInUser).mockResolvedValue("/affiliate");
    await expect(signInAction(null, form({}))).rejects.toThrow("redirect:/affiliate");
    expect(landingForSignedInUser).toHaveBeenCalledWith("user-1");
  });

  it("returns to the invitation the person came from", async () => {
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "signed-in", userId: "user-1" });
    vi.mocked(landingForSignedInUser).mockResolvedValue("/");
    await expect(signInAction(null, form({ next: INVITE }))).rejects.toThrow(`redirect:${INVITE}`);
  });

  it.each(OTHER_NEXT)("ignores the return address %j and lands as usual", async (next) => {
    vi.mocked(signInWithPassword).mockResolvedValue({ status: "signed-in", userId: "user-1" });
    vi.mocked(landingForSignedInUser).mockResolvedValue("/affiliate");
    await expect(signInAction(null, form({ next }))).rejects.toThrow("redirect:/affiliate");
  });
});

describe("signUpAction", () => {
  it("keeps the code step when the robot check fails on it", async () => {
    vi.mocked(checkHuman).mockResolvedValue({ ok: false, message: "No." });
    expect(await signUpAction(ON_CODE, form(SIGN_UP))).toEqual({ ok: false, message: "No.", otp: OTP });
    expect(checkHuman).toHaveBeenCalledWith(expect.any(FormData), "join");
  });

  it("refuses a form that does not pass, before any code is sent", async () => {
    const result = await signUpAction(null, form({ ...SIGN_UP, agree: "" }));
    expect(result).toEqual({ ok: false, message: "Tick the box to agree to the Terms and Privacy Notice.", otp: null });
    expect(requestJoinCode).not.toHaveBeenCalled();
  });

  it("refuses the free listing, which Brandbasket does not sell", async () => {
    const result = await signUpAction(null, form({ ...SIGN_UP, choice: "listing_only" }));
    expect(result).toMatchObject({ ok: false, message: "Choose a plan to continue." });
    expect(requestJoinCode).not.toHaveBeenCalled();
  });

  it("emails a code first, and moves to the code step", async () => {
    vi.mocked(requestJoinCode).mockResolvedValue({ kind: "code", otp: OTP });
    expect(await signUpAction(null, form(SIGN_UP))).toEqual(ON_CODE);
  });

  it("says how long to wait when a send is limited", async () => {
    vi.mocked(requestJoinCode).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 120 });
    expect(await signUpAction(null, form(SIGN_UP))).toEqual({
      ok: false,
      message: "Too many code requests from this network. Try again in 2 minutes.",
      otp: null,
      retry: { operation: "send", scope: "network", retryAfterSeconds: 120 },
    });
  });

  it("treats Send a new code as a first send, dropping the code it had", async () => {
    vi.mocked(requestJoinCode).mockResolvedValue({ kind: "code", otp: { ...OTP, otpId: "new" } });
    await signUpAction(ON_CODE, form({ ...SIGN_UP, otpId: OTP.otpId, code: "123456", resend: "1" }));
    expect(requestJoinCode).toHaveBeenCalledWith(expect.objectContaining({ code: null }));
    expect(createListingAccount).not.toHaveBeenCalled();
  });

  it("stays on the code step for a wrong code", async () => {
    vi.mocked(createListingAccount).mockResolvedValue({ kind: "wrong-code", message: "That code isn't right. 4 tries left." });
    expect(await signUpAction(ON_CODE, form({ ...SIGN_UP, otpId: OTP.otpId, code: "123456" }))).toEqual({ ok: false, message: "That code isn't right. 4 tries left.", otp: OTP });
  });

  it("opens the account and goes to the questions on the services the link chose, catalogue ids only", async () => {
    vi.mocked(createListingAccount).mockResolvedValue({ kind: "created" });
    await expect(signUpAction(ON_CODE, form({ ...SIGN_UP, otpId: OTP.otpId, code: "123456" }))).rejects.toThrow("redirect:/start?services=managed-website,paid-ads");
    expect(createListingAccount).toHaveBeenCalledWith(expect.objectContaining({ email: "meera@example.test", code: { otpId: OTP.otpId, code: "123456" } }), null, { inviteToken: null });
  });

  it("returns to the invitation the person came from instead of the questions", async () => {
    vi.mocked(createListingAccount).mockResolvedValue({ kind: "created" });
    await expect(signUpAction(ON_CODE, form({ ...SIGN_UP, otpId: OTP.otpId, code: "123456", next: INVITE }))).rejects.toThrow(`redirect:${INVITE}`);
    expect(createListingAccount).toHaveBeenCalledWith(expect.anything(), null, { inviteToken: "A".repeat(43) });
  });

  it.each(OTHER_NEXT)("ignores the return address %j and goes to the questions", async (next) => {
    vi.mocked(createListingAccount).mockResolvedValue({ kind: "created" });
    await expect(signUpAction(ON_CODE, form({ ...SIGN_UP, otpId: OTP.otpId, code: "123456", next }))).rejects.toThrow("redirect:/start?services=managed-website,paid-ads");
  });
});

describe("the sign-up form through signUpAction", () => {
  it("posts the country code under its own name, so the real form is not refused", async () => {
    vi.mocked(requestJoinCode).mockResolvedValue({ kind: "code", otp: OTP });
    const { container } = render(
      createElement(SignUpForm, {
        siteKey: null,
        services: ["managed-website"],
        basket: { name: "Website Management", prices: { INR: "₹2,999/month", USD: "$65/month" } },
        confirmsCodes: true,
        countries: [{ value: "IN", label: "India" }],
        phoneCountries: [
          { code: "IN", label: "India +91", dialCode: "+91" },
          { code: "AE", label: "United Arab Emirates +971", dialCode: "+971" },
        ],
        defaultPhoneCountry: "IN",
        prefill: null,
        startToken: null,
      }),
    );
    const field = (name: string): HTMLInputElement => {
      const input = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (input === null) throw new Error(`No input named ${name}`);
      return input;
    };
    fireEvent.change(field("businessName"), { target: { value: SIGN_UP.businessName } });
    fireEvent.change(field("name"), { target: { value: SIGN_UP.name } });
    fireEvent.change(field("email"), { target: { value: SIGN_UP.email } });
    fireEvent.change(field("password"), { target: { value: SIGN_UP.password } });
    fireEvent.change(field("phone"), { target: { value: SIGN_UP.phone } });
    // The state Select takes a value the way a browser autofills it: through its hidden input.
    fireEvent.change(field("stateCode"), { target: { value: "mh" } });
    await waitFor(() => expect(field("stateCode").value).toBe("mh"));
    await userEvent.click(screen.getByRole("checkbox"));

    const posted = new FormData(container.querySelector("form") ?? undefined);
    expect(posted.getAll("phone")).toEqual([SIGN_UP.phone]);
    expect(posted.get("phoneCountry")).toBe("IN");
    expect(posted.get("agree")).toBe("yes");

    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    });
    await waitFor(() => expect(requestJoinCode).toHaveBeenCalledTimes(1));
    expect(requestJoinCode).toHaveBeenCalledWith(expect.objectContaining({ email: SIGN_UP.email, code: null }));
  });
});

describe("requestPasswordResetAction", () => {
  it("refuses an identifier that is neither an email nor a number, sending nothing", async () => {
    expect(await requestPasswordResetAction(null, form({ identifier: "nope" }))).toMatchObject({ ok: false });
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("answers the same whether or not there is an account", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue("accepted");
    expect(await requestPasswordResetAction(null, form({ identifier: " Owner@Example.TEST " }))).toEqual({ ok: true, data: { kind: "email", typed: "owner@example.test" } });
  });

  it("tells a network over its budget to wait", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValue("limited");
    expect(await requestPasswordResetAction(null, form({ identifier: "owner@example.test" }))).toEqual({ ok: false, message: "Too many requests from this network. Try again in an hour." });
  });
});

describe("resetPasswordAction", () => {
  const RESET = { token: "tok", password: "correct-horse-battery-9!", confirmPassword: "correct-horse-battery-9!" };

  it("refuses passwords that do not match, before the link is used", async () => {
    expect(await resetPasswordAction(null, form({ ...RESET, confirmPassword: "other" }))).toEqual({ ok: false, message: "Both passwords must match." });
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("replaces the form when the link is dead", async () => {
    vi.mocked(resetPassword).mockResolvedValue("dead-link");
    expect(await resetPasswordAction(null, form(RESET))).toMatchObject({ ok: false, deadLink: true });
  });

  it("sends the person to sign in with the new password", async () => {
    vi.mocked(resetPassword).mockResolvedValue("changed");
    await expect(resetPasswordAction(null, form(RESET))).rejects.toThrow("redirect:/login?notice=password-changed");
    expect(redirect).toHaveBeenCalledTimes(1);
  });
});

describe("completeSetupAction", () => {
  const SETUP = { token: "tok", name: "Meera Shah", password: "correct-horse-battery-9!", confirmPassword: "correct-horse-battery-9!", agree: "yes" };

  it("refuses a link with no token", async () => {
    expect(await completeSetupAction(null, form({ ...SETUP, token: "" }))).toEqual({ ok: false, message: "This setup link is incomplete. Open the link from your email again." });
    expect(redeemSetupInvite).not.toHaveBeenCalled();
  });

  it("points at the tick box when the terms are not agreed", async () => {
    vi.mocked(redeemSetupInvite).mockRejectedValue(new TermsNotAgreedError());
    expect(await completeSetupAction(null, form(SETUP))).toMatchObject({ ok: false, field: "agree" });
  });

  it("moves to the existing account's password when the email already has one", async () => {
    vi.mocked(redeemSetupInvite).mockRejectedValue(new AccountAlreadyExistsError("meera@example.test"));
    expect(await completeSetupAction(null, form(SETUP))).toMatchObject({ ok: false, mode: "verify-existing", field: "password" });
  });

  it("goes Home once the account and business exist", async () => {
    vi.mocked(redeemSetupInvite).mockResolvedValue(undefined);
    await expect(completeSetupAction(null, form(SETUP))).rejects.toThrow("redirect:/");
  });
});
