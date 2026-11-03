import { render as baseRender, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { SupportAttachment, SupportMessage, SupportTicket } from "@brandbasket/db";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import type { ChangeData, ThreadData } from "../loader";
import type { RequestRow } from "../rules";
import { RequestDetail } from "./request-detail";
import { RequestsScreen } from "./requests-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => "/requests", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("../actions", () => ({ acceptQuoteAction: vi.fn(), approveChangeAction: vi.fn(), declineQuoteAction: vi.fn(), reopenRequestAction: vi.fn(), replyAction: vi.fn(), markReadAction: vi.fn().mockResolvedValue({ ok: true }) }));

const render = (node: ReactNode) => baseRender(<NuqsTestingAdapter>{node}</NuqsTestingAdapter>);

const NOW = new Date("2026-11-04T06:00:00.000Z");
const FAILED = { ok: false, error: { at: NOW } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;
const customer = (role: "owner" | "viewer"): CustomerContext => ({ role, user: { name: "Anand Verma" }, billing: { hasAccess: true, plan: null } }) as unknown as CustomerContext;

const ROW: RequestRow = {
  ticketId: "t1",
  title: "Change my opening hours",
  word: "In progress",
  status: "in_progress",
  tone: "progress",
  kind: "website",
  service: "website",
  kindLabel: "Website",
  lastActivityAt: NOW,
  unread: false,
  open: true,
  quoteTotal: null,
};

describe("RequestsScreen states", () => {
  const base = { includedLine: null, status: "all", service: "all", open: undefined, notice: null, dialog: <div>dialog</div> } as const;

  it("a failed list shows its own error with Try again and no empty sentence", () => {
    render(<RequestsScreen {...base} customer={customer("owner")} rows={FAILED} />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your requests.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Requests", level: 1 })).toBeTruthy();
    expect(screen.queryByText("No requests yet")).toBeNull();
  });

  it("an empty list says why and what will appear", () => {
    const { container } = render(<RequestsScreen {...base} customer={customer("owner")} rows={{ ok: true, data: [] }} />);
    expect(screen.getByText("No requests yet")).toBeTruthy();
    expect(screen.getByText(/Follow it here, from our first reply to the day it is done/)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });

  it.each([
    ["all", "No requests for this service"],
    ["waiting", "Nothing is waiting for you"],
    ["open", "Nothing is open"],
    ["done", "Nothing is done yet"],
  ] as const)("a %s filter with no match says why", (status, title) => {
    // One open request that matches "open" only through the service filter being all: use a done-less list to empty the others.
    const done: RequestRow = { ...ROW, open: false, word: "Done", status: "done", tone: "done" };
    const rows = status === "open" ? [done] : [ROW];
    render(<RequestsScreen {...base} status={status} service={status === "all" ? "search" : "all"} customer={customer("owner")} rows={{ ok: true, data: rows }} />);
    expect(screen.getByText(title)).toBeTruthy();
  });
});

describe("RequestDetail states", () => {
  const ticket: SupportTicket = {
    id: "t1",
    displayRef: "BB-1001",
    requesterUserId: "u1",
    businessId: "b1",
    category: "general",
    subject: "Change my opening hours",
    status: "new",
    priority: "normal",
    assigneeStaffId: null,
    version: 1,
    submissionKey: "key-12345678",
    submissionHash: "0".repeat(64),
    lastActivityAt: NOW,
    retentionStartedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  } as SupportTicket;
  const message: SupportMessage = { id: "m1", ticketId: "t1", visibility: "public", authorRole: "customer", authorUserId: "u1", body: "Please open at 9.", details: null, submissionKey: "key-12345678", submissionHash: "0".repeat(64), createdAt: NOW } as SupportMessage;
  const attachment: SupportAttachment = { id: "a1", ticketId: "t1", messageId: "m1" } as SupportAttachment;
  const thread = (data: Partial<ThreadData> = {}): { ok: true; data: ThreadData } => ({ ok: true, data: { ticket, messages: [message], attachments: [attachment], ...data } });
  const noChange: { ok: true; data: ChangeData | null } = { ok: true, data: null };

  const show = (props: { thread: RequestDetailThread; change: RequestDetailChange }) =>
    render(<RequestDetail customer={customer("owner")} ticketId="t1" thread={props.thread} change={props.change} notice={null} now={NOW} />);
  type RequestDetailThread = Parameters<typeof RequestDetail>[0]["thread"];
  type RequestDetailChange = Parameters<typeof RequestDetail>[0]["change"];

  it("a failed change read shows its own error and keeps the conversation, details and attachments", () => {
    show({ thread: thread(), change: FAILED });
    expect(screen.getByText("We could not load where your request is.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Details" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Attachments" })).toBeTruthy();
    expect(screen.getByText("Please open at 9.")).toBeTruthy();
  });

  it("a failed thread read gives the conversation, details and attachments each their own error", () => {
    show({ thread: FAILED, change: noChange });
    for (const what of ["the conversation", "the details", "the attachments"]) expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Request", level: 1 })).toBeTruthy();
  });

  it("a conversation with no files says so", () => {
    const { container } = show({ thread: thread({ attachments: [] }), change: noChange });
    expect(screen.getByText("No files yet.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
