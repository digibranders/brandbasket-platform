import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NextStepPanel } from "./next-step-panel";
import { RequestsScreen } from "./requests-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/requests", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/refresh-button", () => ({ RefreshButton: () => <button type="button">Try again</button> }));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  FilterBar: () => <div>filters</div>,
  DataTable: () => <div>table</div>,
}));
vi.mock("../actions", () => ({ acceptQuoteAction: vi.fn(), approveChangeAction: vi.fn(), declineQuoteAction: vi.fn(), reopenRequestAction: vi.fn() }));

const customer = (role: "owner" | "viewer") => ({ role, billing: { hasAccess: true } }) as never;
const base = { includedLine: null, status: "all", service: "all", open: undefined, notice: null, dialog: <div>dialog</div> } as const;

describe("RequestsScreen", () => {
  it("shows the panel's error state, not an empty list, when the list failed to load", () => {
    render(<RequestsScreen {...base} customer={customer("owner")} rows={{ ok: false, error: { at: new Date("2026-11-03T05:00:00Z") } }} />);
    expect(screen.getByText("We could not load your requests.")).toBeTruthy();
    expect(screen.queryByText("No requests yet")).toBeNull();
  });

  it("offers New request and the dialog to an owner, and neither to a viewer", () => {
    const { unmount } = render(<RequestsScreen {...base} customer={customer("owner")} rows={{ ok: true, data: [] }} />);
    expect(screen.getAllByRole("link", { name: "New request" }).length).toBeGreaterThan(0);
    expect(screen.getByText("dialog")).toBeTruthy();
    unmount();
    render(<RequestsScreen {...base} customer={customer("viewer")} rows={{ ok: true, data: [] }} />);
    expect(screen.queryByRole("link", { name: "New request" })).toBeNull();
    expect(screen.queryByText("dialog")).toBeNull();
  });
});

describe("NextStepPanel", () => {
  const step = {
    title: "Waiting for you",
    text: "Needs your OK.",
    quote: { line: "New page, 3 hours at ₹500 an hour, GST included", total: "₹1,500" },
    action: { kind: "accept", label: "Accept and pay ₹1,500" },
    secondary: { kind: "decline", label: "Not now" },
    note: "₹1,500 includes 18% GST",
  } as const;

  it("shows the quote's price, the buttons and the GST note to someone who can act", () => {
    render(<NextStepPanel step={step} requestId="r1" canAct />);
    expect(screen.getByRole("button", { name: "Accept and pay ₹1,500" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
    expect(screen.getByText("₹1,500 includes 18% GST")).toBeTruthy();
  });

  it("shows a viewer the sentence and the price but no button", () => {
    render(<NextStepPanel step={step} requestId="r1" canAct={false} />);
    expect(screen.getByText("Needs your OK.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
