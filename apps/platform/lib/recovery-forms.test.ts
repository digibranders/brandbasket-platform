// @vitest-environment happy-dom
import { BRAND } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
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

const JOIN_PROPS = { initialChoice: "care", preselected: null, choices: BRAND.joinChoices, legalLinks: legalLinksFor(BRAND), prices: { care: null, premium: null }, confirmsCodes: true } as const;
const codeStep = { otpId: "challenge", emailHint: "o•••@example.test", confirmRequired: true };

/** Fills the details a Care sign-up asks for and asks for the code. */
async function askForCode(): Promise<void> {
  await type("businessName", "Smile Dental");
  await type("name", "Owner");
  await type("email", "owner@example.test");
  await type("password", "a-long-password");
  await act(async () => container.querySelector<HTMLInputElement>('input[name="agree"]')?.click());
  await click("Email me a code");
}

it("focuses the email result, preserving a clear stage announcement", async () => {
  await render(createElement(ForgotPasswordForm, { action: async (): Promise<ForgotPasswordFormState> => ({ status: "sent", email: "owner@example.com" }) }));
  await type("identifier", "owner@example.com");
  await click("Email me a link");
  expect(document.activeElement?.getAttribute("role")).toBe("status");
  expect(container.textContent).toContain("emailed it a link");
});

it("keeps the address and focuses a neutral delivery failure", async () => {
  await render(createElement(ForgotPasswordForm, { action: async (): Promise<ForgotPasswordFormState> => ({ status: "error", message: "Please try again." }) }));
  await type("identifier", "owner@example.com");
  await click("Email me a link");
  expect(container.querySelector<HTMLInputElement>('input[name="identifier"]')?.value).toBe("owner@example.com");
  expect(document.activeElement?.getAttribute("role")).toBe("alert");
});

it("asks a password reset for an email only, and never offers a code or a mobile number", async () => {
  await render(createElement(ForgotPasswordForm, { action: async (): Promise<ForgotPasswordFormState> => ({ status: "idle" }) }));
  expect(container.querySelector('input[name="identifier"][type="email"]')).not.toBeNull();
  expect(container.querySelector('input[name="code"]')).toBeNull();
  expect(container.textContent).not.toMatch(/mobile|number|text(ed)?\b|code/i);
});

it("focuses signup details when replacing the plan chooser", async () => {
  await render(createElement(JoinForm, {
    ...JOIN_PROPS, action: async (): Promise<JoinFormState> => ({ status: "idle" }), initialChoice: null, choices: LISTING_BRAND.joinChoices,
  }));
  await act(async () => container.querySelector<HTMLInputElement>('input[value="listing_only"]')?.click());
  await click("Continue");
  expect(document.activeElement?.getAttribute("name")).toBe("name");
});

it("asks a sign-up for an email address, and never for a mobile number", async () => {
  await render(createElement(JoinForm, { ...JOIN_PROPS, action: async (): Promise<JoinFormState> => ({ status: "idle" }) }));
  expect(container.querySelector('input[name="email"][type="email"]')).not.toBeNull();
  expect(container.querySelector('input[name="phone"]')).toBeNull();
  expect(container.textContent).toContain("Email me a code");
  expect(container.textContent).not.toMatch(/mobile number|text(ed)? (it|you)|send me a code/i);
});

it("tells the owner where the code was emailed, and offers to change the address", async () => {
  await render(createElement(JoinForm, { ...JOIN_PROPS, action: async (): Promise<JoinFormState> => ({ status: "code", otp: codeStep }) }));
  await askForCode();
  expect(container.textContent).toContain("We emailed a 6-digit code to o•••@example.test");
  expect(container.querySelector('input[type="hidden"][name="email"]')).not.toBeNull();
  expect(container.querySelector('input[type="hidden"][name="phone"]')).toBeNull();
  expect(container.textContent).toContain("Change email");
  expect(container.textContent).not.toMatch(/texted|text message|mobile/i);
});

it("goes back to the details, with the address as typed, on Change email", async () => {
  await render(createElement(JoinForm, { ...JOIN_PROPS, action: async (): Promise<JoinFormState> => ({ status: "code", otp: codeStep }) }));
  await askForCode();
  await click("Change email");
  expect(container.querySelector<HTMLInputElement>('input[name="email"]:not([type="hidden"])')?.value).toBe("owner@example.test");
  expect(container.textContent).toContain("Email me a code");
});

it("says so, and takes any six digits, while the local test mode is on", async () => {
  await render(createElement(JoinForm, {
    ...JOIN_PROPS, action: async (): Promise<JoinFormState> => ({ status: "code", otp: { ...codeStep, confirmRequired: false } }),
  }));
  await askForCode();
  expect(container.textContent).toContain("Test mode: enter any 6 digits");
  expect(container.textContent).not.toContain("Send a new code");
  expect(button("Continue")).toBeDefined();
});

it("keeps the emailed code usable while a blocked resend counts down", async () => {
  vi.useFakeTimers();
  const action = vi.fn().mockResolvedValueOnce({ status: "code", otp: codeStep }).mockResolvedValueOnce({
    status: "error", message: "Too many code requests for this email address. Try again in 3 seconds.", otp: codeStep,
    retry: { scope: "email", operation: "send", retryAfterSeconds: 3 },
  });
  await render(createElement(JoinForm, { ...JOIN_PROPS, action }));
  await askForCode();
  await click("Send a new code");
  const resend = container.querySelector<HTMLButtonElement>('button[name="resend"]');
  expect(resend?.disabled).toBe(true);
  await type("code", "123456");
  expect(button("Verify and continue").disabled).toBe(false);
  expect(container.querySelector('input[name="otpId"]')?.getAttribute("value")).toBe(codeStep.otpId);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(resend?.disabled).toBe(false);
});

it("locks the details while a code is being sent", async () => {
  let release: ((state: JoinFormState) => void) | undefined;
  await render(createElement(JoinForm, {
    ...JOIN_PROPS, action: () => new Promise<JoinFormState>((resolve) => { release = resolve; }),
  }));
  await type("businessName", "Smile Dental");
  await type("name", "Owner");
  await type("email", "owner@example.test");
  await type("password", "a-long-password");
  await act(async () => container.querySelector<HTMLInputElement>('input[name="agree"]')?.click());
  await click("Email me a code");
  for (const name of ["businessName", "name", "email", "password"]) {
    expect(container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.readOnly, name).toBe(true);
  }
  await act(async () => release?.({ status: "code", otp: codeStep }));
});
