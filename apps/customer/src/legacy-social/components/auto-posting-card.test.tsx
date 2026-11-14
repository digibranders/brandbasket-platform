import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/legacy-social/actions", () => ({ setAutoPostingAction: save }));

import { AutoPostingCard } from "./auto-posting-card";

const channels = [
  { platform: "instagram", account: "acme_foods" },
  { platform: "facebook", account: "Test Page" },
] as const;
const none = { channels: [], safetyHours: 24, consentedAt: null, needsChoice: ["instagram", "facebook"] } as const;

afterEach(() => {
  cleanup();
  save.mockReset();
});

describe("AutoPostingCard", () => {
  it("says the customer approves every post until she chooses, and shows nothing with no channel", () => {
    render(<AutoPostingCard auto={none} channels={channels} canChange />);
    expect(screen.getByText(/You approve every post before it goes out/)).toBeTruthy();
    cleanup();
    const { container } = render(<AutoPostingCard auto={none} channels={[]} canChange />);
    expect(container.textContent).toBe("");
  });

  it("cannot be saved without a channel and her agreement, and then sends the channels, no wait and the agreement", async () => {
    save.mockResolvedValue({ status: "saved" });
    render(<AutoPostingCard auto={none} channels={channels} canChange />);
    fireEvent.click(screen.getByRole("button", { name: "Choose channels" }));
    const saveButton = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /Instagram/ }));
    expect(saveButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree that Brandbasket may approve/ }));
    expect(saveButton.disabled).toBe(false);
    expect(screen.queryByLabelText("We approve a picture")).toBeNull();
    fireEvent.click(saveButton);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const form = save.mock.calls[0]?.[0] as FormData;
    expect(form.get("channels")).toBe("instagram");
    expect(form.get("hours")).toBe("0");
    expect(form.get("agreed")).toBe("yes");
  });

  it("says which channels are automatic and which she approves, and switches off with no agreement", async () => {
    save.mockResolvedValue({ status: "saved" });
    render(<AutoPostingCard auto={{ channels: ["instagram"], safetyHours: 24, consentedAt: "2026-11-14T10:00:00Z", needsChoice: ["facebook"] }} channels={channels} canChange />);
    expect(screen.getByText(/Automatic for Instagram\./)).toBeTruthy();
    expect(screen.getByText(/Facebook: you approve each post/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch off" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const form = save.mock.calls[0]?.[0] as FormData;
    expect(form.get("channels")).toBe("");
    expect(form.get("agreed")).toBeNull();
  });

  it("asks again about a channel connected since she chose, and offers it ticked when she opens the choice", () => {
    render(<AutoPostingCard auto={{ channels: ["instagram"], safetyHours: 24, consentedAt: "2026-11-14T10:00:00Z", needsChoice: ["facebook"] }} channels={channels} canChange />);
    expect(screen.getByRole("status").textContent).toContain("You connected Facebook since you chose");
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect((screen.getByRole("checkbox", { name: /Facebook/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("does not ask a customer who has never chosen about each channel, and gives a viewer no buttons", () => {
    render(<AutoPostingCard auto={none} channels={channels} canChange={false} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows what the posting service refused and keeps the choice open", async () => {
    save.mockResolvedValue({ status: "error", message: "Connect an account for that network first, then try again." });
    render(<AutoPostingCard auto={none} channels={channels} canChange />);
    fireEvent.click(screen.getByRole("button", { name: "Choose channels" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Instagram/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree that Brandbasket may approve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Connect an account");
    expect(await screen.findByRole("button", { name: "Save" })).toBeTruthy();
  });
});
