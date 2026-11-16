import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import { TeamPanels } from "@/features/team/components/team-panels";
import { PrivacyPanels } from "./privacy-panels";
import { SettingsCard } from "./settings-card";
import { SettingsHeader, visibleSettingsTabs } from "./settings-header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({ saveNomineeAction: vi.fn(), clearNomineeAction: vi.fn() }));
vi.mock("@/features/team/actions", () => ({ inviteAction: vi.fn(), removeMemberAction: vi.fn(), revokeInviteAction: vi.fn() }));
vi.mock("@/features/consent/consent", () => ({ MEASUREMENT_TOOLS: ["Google Analytics"] }));
vi.mock("@/features/consent/components/cookie-settings-button", () => ({ CookieSettingsButton: () => <button type="button">Change my choice</button> }));

describe("settings tabs", () => {
  it("offers Delete account, in the danger tone, to the owner only", () => {
    const owner = visibleSettingsTabs(true, false);
    expect(owner.at(-1)).toMatchObject({ label: "Delete account", href: "/settings/delete", tone: "danger" });
    expect(visibleSettingsTabs(false, false).map((tab) => tab.label)).toEqual(["Profile", "Sign-in and security", "Notifications", "Privacy and data"]);
  });

  it("marks the current tab with aria-current and has no tab roles", () => {
    render(<SettingsHeader current="/settings/delete" showTeam />);
    expect(screen.getByRole("link", { name: "Delete account" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("navigation", { name: "Settings" })).toBeTruthy();
  });
});

describe("SettingsCard", () => {
  it("gives only the focal and danger cards a coloured top edge", () => {
    const { container } = render(
      <>
        <SettingsCard title="A" tone="focal">
          a
        </SettingsCard>
        <SettingsCard title="B" tone="danger">
          b
        </SettingsCard>
        <SettingsCard title="C">c</SettingsCard>
      </>,
    );
    const cards = container.querySelectorAll("section");
    expect(cards[0]?.className).toContain("border-t-accent-gold");
    expect(cards[1]?.className).toContain("border-t-neg-text");
    expect(cards[2]?.className).not.toContain("border-t-");
  });
});

describe("permission and empty states", () => {
  it("tells someone who is not the owner to ask the owner to delete the account", () => {
    render(
      <ToastProvider>
        <PrivacyPanels nominee={{ ok: true, data: null }} measuring={false} canDelete={false} />
      </ToastProvider>,
    );
    expect(screen.getByText("Ask your owner to do this.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Delete my account" })).toBeNull();
  });

  it("says no colleagues have been invited when the owner is alone", () => {
    const owner = { userId: "u1", name: "Anita", email: "a@example.com", role: "owner" as const, joinedAt: new Date("2026-11-01T00:00:00Z"), isYou: true };
    render(
      <ToastProvider>
        <TeamPanels members={{ ok: true, data: [owner] }} invites={{ ok: true, data: [] }} />
      </ToastProvider>,
    );
    expect(screen.getByText("No colleagues invited yet")).toBeTruthy();
  });
});
