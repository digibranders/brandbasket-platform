import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResetPasswordForm } from "./reset-password-form";

vi.mock("../actions", () => ({ resetPasswordAction: vi.fn() }));
vi.mock("./turnstile", () => ({ TurnstileWidget: () => null }));
vi.mock("@/lib/use-guarded-action-state", async () => {
  const { useActionState } = await import("react");
  return { useGuardedActionState: (action: Parameters<typeof useActionState>[0], initial: null) => useActionState(action, initial) };
});

describe("ResetPasswordForm", () => {
  it("shows no address for an ordinary reset", () => {
    render(<ResetPasswordForm siteKey={null} token="tok" />);
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(screen.getByLabelText("New password")).toBeTruthy();
  });

  it("shows the address, read only, for a customer setting their first password", () => {
    render(<ResetPasswordForm siteKey={null} token="tok" email="owner@example.com" />);
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("owner@example.com");
    expect(email.readOnly).toBe(true);
    expect(email.autocomplete).toBe("username");
  });
});
