import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CallsView } from "../loader";
import { HelpCallsScreen } from "./help-screens";

vi.mock("next/navigation", () => ({ usePathname: () => "/help", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ cancelCallAction: vi.fn(), bookCallAction: vi.fn(), bookKickoffAction: vi.fn() }));

const FAILED = { ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;

describe("Help & calls states", () => {
  it("a failed read shows the error under the real header and no Book a call, and never the empty sentences", () => {
    render(<HelpCallsScreen calls={FAILED} />);
    expect(screen.getAllByText("We could not load your calls.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Help & calls", level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Upcoming" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Past calls" })).toBeTruthy();
    expect(screen.queryByText("No calls booked")).toBeNull();
    expect(screen.queryByText("No past calls yet")).toBeNull();
  });

  it("no calls says why and what will appear in each panel", () => {
    const empty: CallsView = { upcoming: [], past: [], book: null };
    const { container } = render(<HelpCallsScreen calls={{ ok: true, data: empty }} />);
    expect(screen.getByText("No calls booked")).toBeTruthy();
    expect(screen.getByText("Book a call when you want to talk something through.")).toBeTruthy();
    expect(screen.getByText("No past calls yet")).toBeTruthy();
    expect(screen.getByText("What we agreed on each call shows here.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
