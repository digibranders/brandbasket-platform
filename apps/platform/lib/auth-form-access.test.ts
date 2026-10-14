// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupForm } from "@/components/panel/setup-form";
import { ResetPasswordForm } from "@/components/panel/reset-password-form";
import { VerifyBusiness } from "@/components/panel/business/verify-business";
import { StepFormError, StepTextField, useStepForm } from "@/components/panel/step-form";
import { DeleteAccountFlow } from "@/components/panel/delete-account-flow";
import type { SetupFormState } from "@/lib/setup-form";
import type { VerifyBusinessState } from "@/lib/verify-business-form";
import type { StepFormState } from "@/lib/onboarding/form-state";

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
});

async function render(element: ReactElement): Promise<void> {
  await act(async () => root.render(element));
}

function input(name: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!element) throw new Error(`Missing input ${name}`);
  return element;
}

/** Types into a field the way a keyboard does, so the submit gate sees it. */
async function type(name: string, value: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input(name), value);
    input(name).dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submit(buttonText?: string): Promise<void> {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) =>
    candidate.type === "submit" && (buttonText === undefined || candidate.textContent === buttonText));
  if (!button) throw new Error(`Missing submit button ${buttonText ?? ""}`);
  await act(async () => button.click());
}

describe("auth form access", () => {
  it("switches setup to current-password verification and focuses its empty password", async () => {
    const action = vi.fn(async (): Promise<SetupFormState> => ({
      status: "error", message: "Enter your existing account password.", mode: "verify-existing", field: "password",
    }));
    await render(createElement(SetupForm, { action, token: "invite", turnstileAction: "setup", initialName: "Owner" }));
    await type("password", "proposed-new-password");
    await type("confirmPassword", "proposed-new-password");
    await act(async () => input("agree").click());
    await submit();
    expect(action).toHaveBeenCalledOnce();
    expect(input("password").autocomplete).toBe("current-password");
    expect(input("password").value).toBe("");
    expect(container.querySelector('input[name="confirmPassword"]')).toBeNull();
    expect(document.activeElement).toBe(input("password"));
  });

  it("focuses a reset failure and a replaced dead-link result", async () => {
    const action = vi.fn().mockResolvedValueOnce({ status: "error", message: "Both passwords must match." })
      .mockResolvedValueOnce({ status: "dead-link" });
    await render(createElement(ResetPasswordForm, { action, token: "reset" }));
    await type("password", "a-long-new-password");
    await type("confirmPassword", "another-long-password");
    await submit();
    expect(document.activeElement).toBe(input("password"));
    // React clears an uncontrolled form once its action settles, so the passwords are typed again.
    await type("password", "a-long-new-password");
    await type("confirmPassword", "a-long-new-password");
    await submit();
    expect(document.activeElement?.getAttribute("role")).toBe("alert");
  });

  it("keeps the returned verification destination, offers resend and focuses code failures", async () => {
    const sent: VerifyBusinessState = { status: "sent", otpId: "11111111-1111-1111-1111-111111111111", texted: true, phoneHint: "••••4321" };
    const action = vi.fn().mockResolvedValueOnce(sent).mockResolvedValueOnce({
      status: "error", message: "Wrong code", step: { ...sent },
    }).mockResolvedValueOnce({ ...sent, otpId: "22222222-2222-2222-2222-222222222222" });
    await render(createElement(VerifyBusiness, { action, phoneHint: "••••1234" }));
    await submit();
    expect(container.textContent).toContain("••••4321");
    expect(document.activeElement).toBe(input("code"));
    await type("code", "123456");
    await submit("Confirm");
    expect(input("code").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input("code"));
    await submit("Send a new code");
    expect(action.mock.calls[2]?.[1].get("intent")).toBe("resend");
  });

  it("hides stale verification errors and invalid state during a pending retry", async () => {
    let resolve: ((state: VerifyBusinessState) => void) | undefined;
    const sent: VerifyBusinessState = { status: "sent", otpId: "11111111-1111-1111-1111-111111111111", texted: true, phoneHint: "••••4321" };
    const action = vi.fn().mockResolvedValueOnce(sent).mockResolvedValueOnce({ status: "error", message: "Wrong code", step: sent })
      .mockImplementationOnce(() => new Promise<VerifyBusinessState>((done) => { resolve = done; }));
    await render(createElement(VerifyBusiness, { action, phoneHint: "••••1234" }));
    await submit();
    await type("code", "123456");
    await submit("Confirm");
    await type("code", "123456");
    await submit("Confirm");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(input("code").hasAttribute("aria-invalid")).toBe(false);
    expect(container.querySelector('form')?.getAttribute("aria-busy")).toBe("true");
    await act(async () => resolve?.(sent));
  });

  it("retains the returned destination when an expired code returns to sending", async () => {
    const action = vi.fn().mockResolvedValueOnce({ status: "sent", otpId: "11111111-1111-1111-1111-111111111111", texted: true, phoneHint: "••••4321" })
      .mockResolvedValueOnce({ status: "error", message: "Expired", step: "send", phoneHint: "••••4321" });
    await render(createElement(VerifyBusiness, { action, phoneHint: "••••1234" }));
    await submit();
    await type("code", "123456");
    await submit("Confirm");
    expect(container.textContent).toContain("••••4321");
    expect(document.activeElement?.textContent).toBe("Verify my business");
  });

  it("associates each of two step errors with only that form's input", async () => {
    const action = async (): Promise<StepFormState> => ({ status: "error", field: "name", message: "Enter a name.", values: {} });
    function Example(): ReactElement {
      const form = useStepForm(action);
      return createElement("form", { action: form.formAction, ref: form.formRef },
        createElement(StepTextField, { controls: form.controls, name: "name", label: "Name", saved: null, maxLength: 30 }),
        createElement(StepFormError, { controls: form.controls, errorRef: form.errorRef }),
        createElement("button", { type: "submit" }, "Save"));
    }
    await render(createElement("div", null, createElement(Example), createElement(Example)));
    for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
      await act(async () => button.click());
    }
    const forms = [...container.querySelectorAll("form")];
    const ids = forms.map((form) => form.querySelector('[role="alert"]')?.id);
    expect(new Set(ids).size).toBe(2);
    for (const form of forms) expect(form.querySelector("input")?.getAttribute("aria-describedby")).toBe(form.querySelector('[role="alert"]')?.id);
    expect(new Set(forms.map((form) => form.querySelector("input")?.id)).size).toBe(2);
    for (const form of forms) expect(form.querySelector("label")?.htmlFor).toBe(form.querySelector("input")?.id);
  });

  it("focuses deletion confirmation then associates and focuses a password error", async () => {
    await render(createElement(DeleteAccountFlow, {
      lookupOffer: async () => ({ status: "no-offer" } as const), claimOffer: async () => ({ status: "idle" } as const),
      deleteAccount: async () => ({ status: "error", message: "Wrong password", field: "password" } as const), planEndsAt: null, addOnsRunning: false,
    }));
    const reason = input("reason");
    await act(async () => reason.click());
    await submit("Continue");
    expect(document.activeElement?.textContent).toBe("Delete your account");
    await type("confirmation", "DELETE");
    await type("password", "wrong-password");
    await submit("Delete my account");
    expect(document.activeElement).toBe(input("password"));
    expect(input("password").getAttribute("aria-describedby")).toBe(container.querySelector('[role="alert"]')?.id);
  });
});
