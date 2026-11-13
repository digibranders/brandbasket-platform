import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/ui/test-axe";
import { AffiliateSetupForm } from "./affiliate-setup-form";

const action = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({ completeAffiliateSetupAction: action }));

const PROPS = { siteKey: null, token: "t0k3n", initialName: "Kavita Rao" } as const;

describe("AffiliateSetupForm", () => {
  beforeEach(() => action.mockReset());

  it("asks a new affiliate for a name, a password twice and the Terms tick, never ticked for them", () => {
    render(<AffiliateSetupForm {...PROPS} mode="create" />);
    expect(screen.getByLabelText("Your name")).toHaveProperty("value", "Kavita Rao");
    expect(screen.getByLabelText("Choose a password")).toBeTruthy();
    expect(screen.getByLabelText("Repeat the password")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /I agree to the Terms/ }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Create my account" })).toBeTruthy();
  });

  it("asks an address that already has an account for that account's password only", () => {
    render(<AffiliateSetupForm {...PROPS} mode="link-existing" />);
    expect(screen.getByLabelText("Your existing account’s password")).toBeTruthy();
    expect(screen.queryByLabelText("Your name")).toBeNull();
    expect(screen.queryByLabelText("Repeat the password")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Link my account" })).toBeTruthy();
  });

  it("asks an affiliate who already signs in for a new password, with no Terms tick", () => {
    render(<AffiliateSetupForm {...PROPS} mode="new-password" />);
    expect(screen.getByLabelText("Choose a password")).toBeTruthy();
    expect(screen.queryByLabelText("Your name")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Save password" })).toBeTruthy();
  });

  it("moves focus to the Terms box when the tick is missing (Base UI hands focus from its hidden input to the box)", async () => {
    action.mockResolvedValue({ ok: false, message: "Tick the box to agree to the Terms and Privacy Notice.", field: "agree" });
    const { container } = render(<AffiliateSetupForm {...PROPS} mode="create" />);
    const form = container.querySelector("form");
    if (form === null) throw new Error("No form");
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(screen.getByText("Tick the box to agree to the Terms and Privacy Notice.")).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: /I agree to the Terms/ })));
  });

  it("switches to the existing-account step when the server finds the address already has one", async () => {
    action.mockResolvedValue({ ok: false, message: "This email already has a Brandbasket account.", mode: "verify-existing", field: "password" });
    const { container } = render(<AffiliateSetupForm {...PROPS} mode="create" />);
    const form = container.querySelector("form");
    if (form === null) throw new Error("No form");
    await act(async () => {
      fireEvent.submit(form);
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Link my account" })).toBeTruthy());
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(container.querySelector<HTMLInputElement>('input[name="mode"]')?.value).toBe("verify-existing");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<AffiliateSetupForm {...PROPS} mode="create" />);
    await expectNoAxeViolations(container);
  });
});
