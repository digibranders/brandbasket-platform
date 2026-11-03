import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import { PrivacyPanels } from "./privacy-panels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({ saveNomineeAction: vi.fn(), clearNomineeAction: vi.fn() }));
vi.mock("@/features/consent/consent", () => ({ MEASUREMENT_TOOLS: ["Google Analytics", "Microsoft Clarity"] }));
vi.mock("@/features/consent/components/cookie-settings-button", () => ({ CookieSettingsButton: () => <button type="button">Change my choice</button> }));

const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;
const show = (nominee: Parameters<typeof PrivacyPanels>[0]["nominee"]) =>
  render(
    <ToastProvider>
      <PrivacyPanels nominee={nominee} measuring canDelete />
    </ToastProvider>,
  );

describe("Privacy and data states", () => {
  it("a failed nominee read shows its own error and the other panels still draw", () => {
    show(FAILED);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your nominee.");
    for (const heading of ["Your data", "Nominee", "Correct, delete or complain", "Delete account"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  });

  it("no nominee says what a nominee is for", () => {
    const { container } = show({ ok: true, data: null });
    expect(screen.getByText("Someone who can take over the account if you cannot.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
