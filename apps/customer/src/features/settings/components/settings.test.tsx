import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import { setNotificationAction } from "../actions";
import type { DeleteFacts } from "../loader";
import { notificationRows } from "../rules/notifications";
import { DeleteAccountFlow } from "./delete-account-flow";
import { NotificationTable } from "./notification-table";
import { PrivacyPanels } from "./privacy-panels";
import { SettingsHeader } from "./settings-header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  setNotificationAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  saveNomineeAction: vi.fn(),
  clearNomineeAction: vi.fn(),
  saveProfileAction: vi.fn(),
  changePasswordAction: vi.fn(),
  revokeOtherSessionsAction: vi.fn(),
}));
vi.mock("@/features/consent/consent", () => ({ MEASUREMENT_TOOLS: ["Google Analytics", "Microsoft Clarity"] }));
vi.mock("@/features/consent/components/cookie-settings-button", () => ({ CookieSettingsButton: () => <button type="button">Change my choice</button> }));

const CHOICES = { new_enquiry: true, needs_approval: true, request_reply: true, billing: true, monthly_report: true, product_news: false };
const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;

function renderWithToasts(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("SettingsHeader", () => {
  it("shows the Team tab to the owner only", () => {
    const { unmount } = render(<SettingsHeader current="/settings" showTeam />);
    expect(screen.getByRole("link", { name: "Team" })).toBeTruthy();
    unmount();
    render(<SettingsHeader current="/settings" showTeam={false} />);
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
    expect(screen.getByRole("link", { name: "Privacy and data" })).toBeTruthy();
  });
});

describe("NotificationTable", () => {
  it("has one email switch per topic and no WhatsApp column", () => {
    render(<NotificationTable rows={notificationRows(CHOICES)} />);
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    expect(screen.queryByText("WhatsApp")).toBeNull();
    expect(screen.getByRole("switch", { name: "Product news from Brandbasket: email" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "A new enquiry arrives: email" }).getAttribute("aria-checked")).toBe("true");
  });

  it("saves a flip at once with the topic and the new position", async () => {
    vi.mocked(setNotificationAction).mockResolvedValue({ ok: true });
    render(<NotificationTable rows={notificationRows(CHOICES)} />);
    await userEvent.click(screen.getByRole("switch", { name: "An invoice is ready or a payment fails: email" }));
    expect(setNotificationAction).toHaveBeenCalledWith("billing", false);
  });

  it("puts the switch back and says so when the save fails", async () => {
    vi.mocked(setNotificationAction).mockResolvedValue({ ok: false, message: "We could not save that. Try again in a moment." });
    render(<NotificationTable rows={notificationRows(CHOICES)} />);
    const toggle = screen.getByRole("switch", { name: "Your monthly report is ready: email" });
    await userEvent.click(toggle);
    expect(await screen.findByText("We could not save that. Try again in a moment.")).toBeTruthy();
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });
});

describe("DeleteAccountFlow", () => {
  const FACTS: DeleteFacts = { planEndsAt: "2026-11-20T10:00:00.000Z", addOnsRunning: true, packageEnds: ["Your package price (10% off)"] };

  it("asks why first and will not continue without a reason", async () => {
    render(<DeleteAccountFlow facts={FACTS} />);
    const next = screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    await userEvent.click(screen.getByRole("radio", { name: "I’m not using it enough" }));
    expect(next.disabled).toBe(false);
  });

  it("then says what deleting does and asks for the word and the password", async () => {
    render(<DeleteAccountFlow facts={FACTS} />);
    await userEvent.click(screen.getByRole("radio", { name: "I’m not using it enough" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Your plan ends on/)).toBeTruthy();
    expect(screen.getByText("Your package price (10% off)")).toBeTruthy();
    expect(screen.getByText("Your services stop at the end of the month you’ve paid for.")).toBeTruthy();
    expect(screen.getByText(/After 30 days your data is erased/)).toBeTruthy();
    expect(screen.getByLabelText("Type DELETE to confirm")).toBeTruthy();
    expect(screen.getByLabelText("Your password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Keep my account" }).getAttribute("href")).toBe("/settings/privacy");
  });

  it("leaves out the plan lines that do not apply", async () => {
    render(<DeleteAccountFlow facts={{ planEndsAt: null, addOnsRunning: false, packageEnds: [] }} />);
    await userEvent.click(screen.getByRole("radio", { name: "Something else" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/signed out everywhere/)).toBeTruthy();
    expect(screen.queryByText(/Your plan ends on/)).toBeNull();
    expect(screen.queryByText(/services stop/)).toBeNull();
  });
});

describe("PrivacyPanels", () => {
  const NO_NOMINEE = { ok: true, data: null } as const;

  it("offers the download, the nominee and the privacy request, and the owner's delete", () => {
    renderWithToasts(<PrivacyPanels nominee={NO_NOMINEE} measuring canDelete />);
    expect(screen.getByRole("link", { name: "Download" }).getAttribute("href")).toBe("/settings/privacy/export");
    expect(screen.getByRole("button", { name: "Add nominee" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Make a privacy request" }).getAttribute("href")).toBe("mailto:support@brandbasket.in");
    expect(screen.getByRole("button", { name: "Change my choice" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Delete my account" }).getAttribute("href")).toBe("/settings/delete");
  });

  it("hides delete from anyone but the owner, and the measurement choice when nothing measures", () => {
    renderWithToasts(<PrivacyPanels nominee={NO_NOMINEE} measuring={false} canDelete={false} />);
    expect(screen.queryByRole("link", { name: "Delete my account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change my choice" })).toBeNull();
  });

  it("shows the nominee named and offers to change it", () => {
    renderWithToasts(<PrivacyPanels nominee={{ ok: true, data: { name: "Meera Rao", phoneText: "98765 43210" } }} measuring={false} canDelete={false} />);
    expect(screen.getByText("Meera Rao, 98765 43210")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change nominee" })).toBeTruthy();
  });

  it("says the nominee could not be loaded instead of offering to add one", () => {
    renderWithToasts(<PrivacyPanels nominee={FAILED} measuring={false} canDelete={false} />);
    expect(screen.getByText(/We could not load your nominee/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add nominee" })).toBeNull();
    expect(screen.getByRole("link", { name: "Download" })).toBeTruthy();
  });
});
