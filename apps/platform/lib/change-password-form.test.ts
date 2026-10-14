// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangePasswordForm } from "@/components/panel/change-password-form";
import type { ChangePasswordFormState, RevokeOtherSessionsState } from "./account-settings-form";
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
function input(name: string): HTMLInputElement {
  const element = container.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  if (!element) throw new Error(`Missing password input ${name}`);
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
async function fillPasswords(): Promise<void> {
  await type("currentPassword", "old-password"); await type("newPassword", "new-password-1"); await type("confirmPassword", "new-password-1");
}
async function submit(text = "Change password"): Promise<void> {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === text);
  if (!button) throw new Error(`Missing button ${text}`);
  await act(async () => button.click());
}
describe("ChangePasswordForm", () => {
  it("clears sensitive fields on partial success and offers a revoke-only retry", async () => {
    const action = vi.fn(async (): Promise<ChangePasswordFormState> => ({ status: "changed-revoke-failed" }));
    const revokeAction = vi.fn(async (): Promise<RevokeOtherSessionsState> => ({ status: "revoked" }));
    await act(async () => root.render(createElement(ChangePasswordForm, { action, ...{ revokeAction } })));
    await fillPasswords();
    await submit();
    expect(container.textContent).toContain("Your password is changed");
    expect(container.textContent).toContain("other devices could not be signed out");
    expect(input("currentPassword").value).toBe(""); expect(input("newPassword").value).toBe(""); expect(input("confirmPassword").value).toBe("");
    await submit("Sign out other devices");
    expect(action).toHaveBeenCalledOnce(); expect(revokeAction).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Your other devices are signed out");
  });
  it("hides successful password-change notices as soon as a new edit starts", async () => {
    const action = vi.fn(async (): Promise<ChangePasswordFormState> => ({ status: "changed" }));
    const revokeAction = vi.fn(async (): Promise<RevokeOtherSessionsState> => ({ status: "revoked" }));
    await act(async () => root.render(createElement(ChangePasswordForm, { action, ...{ revokeAction } })));
    await fillPasswords(); await submit(); expect(container.textContent).toContain("Your password is changed");
    await act(async () => input("currentPassword").dispatchEvent(new Event("input", { bubbles: true })));
    expect(container.textContent).not.toContain("Your password is changed");
  });
  it("offers a fresh revocation retry when another password change partially succeeds", async () => {
    const action = vi.fn(async (): Promise<ChangePasswordFormState> => ({ status: "changed-revoke-failed" }));
    const revokeAction = vi.fn(async (): Promise<RevokeOtherSessionsState> => ({ status: "revoked" }));
    await act(async () => root.render(createElement(ChangePasswordForm, { action, revokeAction })));
    await fillPasswords(); await submit(); await submit("Sign out other devices");
    expect(container.textContent).toContain("Your other devices are signed out");
    await fillPasswords(); await submit();
    expect(container.textContent).toContain("other devices could not be signed out");
    expect(container.textContent).toContain("Sign out other devices");
  });
  it("clears each successful change even when the previous outcome was also changed", async () => {
    const action = vi.fn(async (): Promise<ChangePasswordFormState> => ({ status: "changed" }));
    const revokeAction = vi.fn(async (): Promise<RevokeOtherSessionsState> => ({ status: "revoked" }));
    await act(async () => root.render(createElement(ChangePasswordForm, { action, ...{ revokeAction } })));
    await fillPasswords(); await submit(); await fillPasswords();
    await submit(); expect(input("currentPassword").value).toBe(""); expect(input("newPassword").value).toBe("");
  });
});
