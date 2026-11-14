import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutoChannel } from "@/legacy-social/lib/social/auto";
import { disconnectChannelAction, previewDisconnectAction } from "@/legacy-social/review-actions";
import { SocialSettingsView } from "./social-settings";

vi.mock("@/legacy-social/review-actions", () => ({
  previewDisconnectAction: vi.fn(async () => ({ ok: true, preview: { scheduled: 6, days: ["2026-11-18", "2026-11-24"], approved: 6, running: [], onlyChannel: false } })),
  disconnectChannelAction: vi.fn(async () => ({ status: "saved" })),
}));
vi.mock("@/features/social/accounts/actions", () => ({ startConnectAction: vi.fn(async () => ({ ok: true })) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const channel = (platform: AutoChannel["platform"], account: string): AutoChannel => ({ id: `${platform}:1`, platform, account, connectedAt: "2026-11-09T10:00:00Z" });
const base = { brandName: "Fresh Sweets", unavailable: false, canChange: true, deletionHref: "mailto:hello@example.test", now: new Date("2026-11-14T10:00:00Z") };

describe("SocialSettingsView", () => {
  it("lists the accounts, and offers to connect the networks that have none", () => {
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), channel("facebook", "Test Page")]} />);
    expect(screen.getByText("acme_foods", { exact: false })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Disconnect" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Connect LinkedIn" })).toBeTruthy();
  });

  it("shows what a disconnect stops, and disconnects when confirmed", async () => {
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), channel("facebook", "Test Page")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByText("will not go out on Instagram")).toBeTruthy());
    expect(screen.getByText("6")).toBeTruthy();
    expect(screen.getByText("Wed 18 Nov")).toBeTruthy();
    expect(vi.mocked(previewDisconnectAction)).toHaveBeenCalledWith("instagram:1");
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Instagram" }));
    await waitFor(() => expect(vi.mocked(disconnectChannelAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(disconnectChannelAction).mock.calls[0]?.[0] as FormData;
    expect(form.get("channelId")).toBe("instagram:1");
    expect(form.get("onlyChannel")).toBeNull();
  });

  it("makes her tick a box before disconnecting her only account", async () => {
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(screen.getByText(/only connected account/)).toBeTruthy());
    const confirm = screen.getByRole("button", { name: "Disconnect Instagram" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(vi.mocked(disconnectChannelAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(disconnectChannelAction).mock.calls[0]?.[0] as FormData).get("onlyChannel")).toBe("1");
  });

  it("shows each account with its logo and says nothing about one that is fine, but speaks up for one that needs attention", () => {
    const soon: AutoChannel = { ...channel("linkedin", "Test Member"), expiresAt: "2026-11-17T10:00:00Z" };
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), soon]} />);
    expect(screen.getAllByRole("img", { name: "Instagram" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Connected")).toBeNull();
    expect(screen.getByText(/Ends in 3 days/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeTruthy();
  });

  it("tells an Instagram or Facebook customer to remove the app in Facebook's settings as well", async () => {
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), channel("linkedin", "Test Member")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Instagram access completely" })).toBeTruthy());
    expect(screen.queryByText(/Business integrations/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove Instagram access completely" }));
    expect(screen.getByText(/Business integrations/)).toBeTruthy();
  });

  it("says calmly when nothing is scheduled, and never says so when it could not find out", async () => {
    vi.mocked(previewDisconnectAction).mockResolvedValueOnce({ ok: true, preview: { scheduled: 0, days: [], approved: 0, running: [], onlyChannel: false } });
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), channel("linkedin", "Test Member")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByText("Nothing is scheduled on Instagram right now.")).toBeTruthy());
    cleanup();
    vi.mocked(previewDisconnectAction).mockResolvedValueOnce({ ok: true, preview: null });
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), channel("linkedin", "Test Member")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByText("Posts will stop going out on Instagram.")).toBeTruthy());
    expect(screen.queryByText(/Nothing is scheduled/)).toBeNull();
  });

  it("asks for the tick when the posting service says it is her only channel", async () => {
    vi.mocked(previewDisconnectAction).mockResolvedValueOnce({ ok: true, preview: { scheduled: 0, days: [], approved: 0, running: [], onlyChannel: true } });
    render(<SocialSettingsView {...base} channels={[channel("instagram", "acme_foods"), channel("facebook", "Test Page")]} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Disconnect" })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeTruthy());
  });

  it("offers a viewer no buttons", () => {
    render(<SocialSettingsView {...base} canChange={false} channels={[channel("instagram", "acme_foods")]} />);
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Connect/ })).toBeNull();
  });
});
