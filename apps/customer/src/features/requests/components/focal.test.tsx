import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RequestRow } from "../rules";
import { NextStepPanel } from "./next-step-panel";
import { RequestsScreen } from "./requests-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/requests", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components")>()),
  FilterBar: () => <div>filters</div>,
  DataTable: () => <div>table</div>,
}));
vi.mock("../actions", () => ({ acceptQuoteAction: vi.fn(), approveChangeAction: vi.fn(), declineQuoteAction: vi.fn(), reopenRequestAction: vi.fn() }));

const NOW = new Date("2026-11-04T06:00:00.000Z");
const ROW: RequestRow = {
  ticketId: "11111111-1111-4111-8111-111111111111",
  title: "Marathi translation page",
  word: "Waiting for you",
  status: "waiting_for_you",
  tone: "waiting",
  kind: "website",
  service: "website",
  kindLabel: "Website",
  lastActivityAt: NOW,
  unread: false,
  open: true,
  quoteTotal: "₹1,500",
};
const base = { includedLine: null, status: "all", service: "all", open: undefined, notice: null, dialog: <div>dialog</div> } as const;
const customer = (role: "owner" | "viewer") => ({ role, billing: { hasAccess: true } }) as never;

describe("Requests list focal quote", () => {
  it("raises the quote that waits for an answer above the list and links to its page", () => {
    render(<RequestsScreen {...base} customer={customer("owner")} rows={{ ok: true, data: [ROW] }} />);
    expect(screen.getByText("Quote ₹1,500, waiting for your answer.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open request" }).getAttribute("href")).toBe(`/requests/${ROW.ticketId}`);
  });

  it("shows no focal card when no quote is waiting, or when the list failed", () => {
    const { unmount } = render(<RequestsScreen {...base} customer={customer("owner")} rows={{ ok: true, data: [{ ...ROW, quoteTotal: null }] }} />);
    expect(screen.queryByRole("link", { name: "Open request" })).toBeNull();
    unmount();
    render(<RequestsScreen {...base} customer={customer("owner")} rows={{ ok: false, error: { at: NOW } }} />);
    expect(screen.queryByRole("link", { name: "Open request" })).toBeNull();
  });

  it("tells a viewer who can send a request, in place of the button", () => {
    render(<RequestsScreen {...base} customer={customer("viewer")} rows={{ ok: true, data: [] }} />);
    expect(screen.getByText("Ask your owner to do this")).toBeTruthy();
  });
});

describe("NextStepPanel finish", () => {
  const quoted = {
    title: "Waiting for you",
    text: "Needs your OK.",
    quote: { line: "New page", total: "₹1,500" },
    action: { kind: "accept", label: "Accept and pay ₹1,500" },
    secondary: { kind: "decline", label: "Not now" },
    note: "₹1,500 includes 18% GST",
  } as const;

  it("is the one focal card when there is a button to press", () => {
    const { container } = render(<NextStepPanel step={quoted} requestId="r1" canAct />);
    expect(container.querySelectorAll("article")).toHaveLength(1);
  });

  it("tells a viewer to ask the owner instead of showing the GST note", () => {
    render(<NextStepPanel step={quoted} requestId="r1" canAct={false} />);
    expect(screen.getByText("Ask your owner to do this")).toBeTruthy();
    expect(screen.queryByText("₹1,500 includes 18% GST")).toBeNull();
  });

  it("is a quiet card, not a focal one, when nothing is asked of the customer", () => {
    const working = { title: "We are working on it", text: "It will be ready to check by Fri 6 Nov.", quote: null, action: null, secondary: null, note: null } as const;
    const { container } = render(<NextStepPanel step={working} requestId="r1" canAct />);
    expect(container.querySelectorAll("article")).toHaveLength(0);
    expect(screen.getByText("We are working on it")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps Reopen on a finished request", () => {
    const done = { title: "Done", text: "This change is live.", quote: null, action: null, secondary: { kind: "reopen", label: "Reopen" }, note: null } as const;
    render(<NextStepPanel step={done} requestId="r1" canAct />);
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
  });
});
