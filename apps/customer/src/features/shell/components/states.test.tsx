import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BellView } from "../rules";
import { NotificationsBell } from "./notifications-bell";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("../actions", () => ({ markNotificationsSeenAction: vi.fn().mockResolvedValue({ ok: true }), signOutAction: vi.fn() }));

const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;

async function open() {
  await userEvent.click(screen.getByRole("button", { name: /Notifications/ }));
}

describe("Notifications bell states", () => {
  it("a failed read says so inside the bell and never claims nothing needs the customer", async () => {
    render(<NotificationsBell notifications={FAILED} />);
    await open();
    expect(await screen.findByText("We could not load your notifications.")).toBeTruthy();
    expect(screen.queryByText("Nothing needs you right now.")).toBeNull();
  });

  it("an empty bell says nothing needs the customer", async () => {
    const empty: BellView = { items: [], unread: 0 };
    render(<NotificationsBell notifications={{ ok: true, data: empty }} />);
    await open();
    const text = await screen.findByText("Nothing needs you right now.");
    expect(text).toBeTruthy();
    expect(document.body.textContent).not.toMatch(NOISE);
  });
});
