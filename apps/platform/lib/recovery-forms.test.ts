// @vitest-environment happy-dom
import { BRANDS } from "./brand";
import { legalLinksFor } from "./legal-links";
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ForgotPasswordForm } from "@/components/panel/forgot-password-form";
import { JoinForm } from "@/components/panel/join-form";
import type { ForgotPasswordFormState } from "./account-recovery-form";
import type { JoinFormState } from "./join-form";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});
async function render(element: ReactElement): Promise<void> { await act(async () => root.render(element)); }
function button(text: string): HTMLButtonElement {
  const result = [...container.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}
async function click(text: string): Promise<void> { await act(async () => button(text).click()); }
/** Types into a field the way a keyboard does, so React state and the submit gate both see it. */
async function type(name: string, value: string): Promise<void> {
  const field = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!field) throw new Error(`Missing field ${name}`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("focuses the email result, preserving a clear stage announcement", async () => {
  await render(createElement(ForgotPasswordForm, { action: async (): Promise<ForgotPasswordFormState> => ({ status: "sent", email: "owner@example.com" }) }));
  await type("identifier", "owner@example.com");
  await click("Continue");
  expect(document.activeElement?.getAttribute("role")).toBe("status");
});

it("keeps the identifier and focuses a neutral delivery failure", async () => {
  await render(createElement(ForgotPasswordForm, { action: async (): Promise<ForgotPasswordFormState> => ({ status: "error", message: "Please try again.", otp: null }) }));
  await type("identifier", "9820000001");
  await click("Continue");
  expect(container.querySelector('input[name="identifier"]')).not.toBeNull();
  expect(document.activeElement?.getAttribute("role")).toBe("alert");
});

it("focuses signup details when replacing the plan chooser", async () => {
  await render(createElement(JoinForm, {
    action: async (): Promise<JoinFormState> => ({ status: "idle" }), initialChoice: null, preselected: null, choices: BRANDS.firstfold.joinChoices, legalLinks: legalLinksFor(BRANDS.firstfold),
    listing: null, placeId: null, businessName: "", signature: "", prices: { care: null, premium: null }, signUpWith: "phone", textsCodes: true,
  }));
  await act(async () => container.querySelector<HTMLInputElement>('input[value="listing_only"]')?.click());
  await click("Continue");
  expect(document.activeElement?.getAttribute("name")).toBe("name");
});

it("asks a Fynix sign-up for an email address, and never for a mobile number", async () => {
  await render(createElement(JoinForm, {
    action: async (): Promise<JoinFormState> => ({ status: "idle" }), initialChoice: "care", preselected: null, choices: BRANDS.fynix.joinChoices, legalLinks: legalLinksFor(BRANDS.fynix),
    listing: null, placeId: null, businessName: "", signature: "", prices: { care: null, premium: null }, signUpWith: "email", textsCodes: true,
  }));
  expect(container.querySelector('input[name="email"][type="email"]')).not.toBeNull();
  expect(container.querySelector('input[name="phone"]')).toBeNull();
  expect(container.textContent).toContain("Email me a code");
  expect(container.textContent).not.toMatch(/mobile number/i);
});

it("tells a Fynix owner where the code was emailed, and offers to change the address", async () => {
  const otp = { otpId: "challenge", phoneHint: "o•••@example.test", via: "email" as const, texted: true };
  await render(createElement(JoinForm, {
    action: async (): Promise<JoinFormState> => ({ status: "code", otp }), initialChoice: "care", preselected: null, choices: BRANDS.fynix.joinChoices, legalLinks: legalLinksFor(BRANDS.fynix),
    listing: null, placeId: null, businessName: "", signature: "", prices: { care: null, premium: null }, signUpWith: "email", textsCodes: true,
  }));
  await type("businessName", "Smile Dental");
  await type("name", "Owner");
  await type("email", "owner@example.test");
  await type("password", "a-long-password");
  await act(async () => container.querySelector<HTMLInputElement>('input[name="agree"]')?.click());
  await click("Email me a code");
  expect(container.textContent).toContain("We emailed a 6-digit code to o•••@example.test");
  expect(container.querySelector('input[type="hidden"][name="email"]')).not.toBeNull();
  expect(container.textContent).toContain("Change email");
  expect(container.textContent).not.toMatch(/texted/i);
});

it("asks a Fynix password reset for an email only, and sends a link", async () => {
  await render(createElement(ForgotPasswordForm, { action: async (): Promise<ForgotPasswordFormState> => ({ status: "sent", email: "owner@example.com" }), emailOnly: true }));
  expect(container.querySelector('input[name="identifier"][type="email"]')).not.toBeNull();
  expect(container.textContent).not.toMatch(/mobile number/i);
  await type("identifier", "owner@example.com");
  await click("Email me a link");
  expect(container.textContent).toContain("emailed it a link");
});

it("keeps an old phone code usable while a blocked resend counts down", async () => {
  vi.useFakeTimers();
  const otp = { otpId: "challenge", phoneHint: "••••1234" };
  const action = vi.fn().mockResolvedValueOnce({ status: "code", otp }).mockResolvedValueOnce({
    status: "error", message: "Code delivery is temporarily busy. Try again in 3 seconds.", otp,
    retry: { scope: "global", operation: "send", retryAfterSeconds: 3 },
  });
  await render(createElement(ForgotPasswordForm, { action }));
  await type("identifier", "9820000001");
  await click("Continue");
  await click("Send a new code");
  const resend = container.querySelector<HTMLButtonElement>('button[name="resend"]');
  expect(resend?.disabled).toBe(true);
  expect(button("Set new password").disabled).toBe(true);
  await type("code", "123456");
  await type("password", "a-long-new-password");
  await type("confirmPassword", "a-long-new-password");
  expect(button("Set new password").disabled).toBe(false);
  expect(container.querySelector('input[name="otpId"]')?.getAttribute("value")).toBe(otp.otpId);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(resend?.disabled).toBe(false);
});

it.each(["phone", "network", "global"] as const)("keeps %s scope accurate when changing the recovery destination", async (scope) => {
  const action = async (): Promise<ForgotPasswordFormState> => ({
    status: "error", message: "Try again soon.", otp: null,
    retry: { scope, operation: "send", retryAfterSeconds: 137 },
  });
  await render(createElement(ForgotPasswordForm, { action }));
  expect(button("Continue").disabled).toBe(true);
  await type("identifier", "9820000002");
  expect(button("Continue").disabled).toBe(false);
  await click("Continue");
  expect(button("Continue").disabled).toBe(true);
  const input = container.querySelector<HTMLInputElement>('input[name="identifier"]');
  if (!input) throw new Error("Missing identifier");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input, "9820000001");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("Continue").disabled).toBe(scope !== "phone");
  await act(async () => {
    setValue?.call(input, "owner@example.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(button("Continue").disabled).toBe(false);
});
