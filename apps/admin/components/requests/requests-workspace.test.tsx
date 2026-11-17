import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RequestRow } from "@/lib/requests-model";
import type { RequestDetail } from "@/lib/server/requests-view";
import { RequestsWorkspace, type RequestsWorkspaceProps } from "./requests-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(protected)/support/status-actions", () => ({ closeTicketAction: vi.fn(), reopenTicketAction: vi.fn(), restoreTicketStatusAction: vi.fn() }));
vi.mock("@/app/(protected)/support/[ticketId]/actions", () => ({ addMessage: vi.fn() }));

const SUPPORT: RequestRow = {
  id: "t1",
  displayRef: "BB-101",
  subject: "Invoice shows the wrong name",
  businessId: "b1",
  businessName: "Sharma Dental",
  categoryLabel: "Billing",
  status: "new",
  queue: "needs_reply",
  type: "support",
  change: null,
  clock: { text: "1d 03h", tone: "late", running: true },
  chips: [
    { label: "Support", variant: "idle" },
    { label: "Late", variant: "failed" },
  ],
};
const CHANGE: RequestRow = {
  ...SUPPORT,
  id: "t2",
  displayRef: "BB-102",
  subject: "Add an Implants page",
  categoryLabel: "Website change",
  type: "change",
  change: { state: "requested", coverage: "undecided", accepted: false, paid: false },
  clock: { text: "9h 10m", tone: "soon", running: true },
  chips: [
    { label: "Change", variant: "idle" },
    { label: "Needs a quote", variant: "waiting" },
    { label: "Past 4 hours", variant: "waiting" },
  ],
};

const DETAIL: RequestDetail = {
  id: "t1",
  subject: SUPPORT.subject,
  displayRef: "BB-101",
  categoryLabel: "Billing",
  status: "new",
  type: "support",
  chips: SUPPORT.chips,
  businessId: "b1",
  businessName: "Sharma Dental",
  requester: { name: "Asha Sharma", contact: "asha@example.test" },
  banner: { tone: "late", text: "Waiting on you", clock: "1d 03h", note: "The 4 hour promise was missed." },
  messages: [
    { id: "m1", who: "Asha Sharma", staff: false, internal: false, createdAtIso: "2026-11-17T06:30:00.000Z", body: "First message", tag: "Opening message", details: [], attachments: [] },
    { id: "m2", who: "You", staff: true, internal: false, createdAtIso: "2026-11-17T08:30:00.000Z", body: "Our reply", tag: null, details: [], attachments: [] },
    { id: "m3", who: "Asha Sharma", staff: false, internal: false, createdAtIso: "2026-11-18T06:30:00.000Z", body: "Follow up", tag: "Latest, not answered", details: [], attachments: [] },
  ],
};

function render(overrides: Partial<RequestsWorkspaceProps> = {}): string {
  const props: RequestsWorkspaceProps = {
    rows: [SUPPORT, CHANGE],
    basePath: "/support",
    defaultQueue: "needs_reply",
    queue: "needs_reply",
    search: "",
    category: "",
    counts: { needsReply: 2, waitingOnClient: 1, done: 4 },
    categoryOptions: [{ value: "", label: "Any category" }],
    openId: null,
    detail: null,
    detailFailedFor: null,
    changeSlot: null,
    newRequestHref: "/support/new",
    nextHref: null,
    empty: { title: "No requests here.", description: "Requests from customers appear here with how long each has been waiting." },
    ...overrides,
  };
  return renderToStaticMarkup(<RequestsWorkspace {...props} />).replaceAll("<!-- -->", "");
}

describe("RequestsWorkspace", () => {
  it("lists support tickets and change requests together, each with a type chip, its state and a clock", () => {
    const html = render();
    for (const text of ["Invoice shows the wrong name", "Add an Implants page", "Support", "Change", "Needs a quote", "Late", "Past 4 hours", "1d 03h", "9h 10m", "Sharma Dental", "BB-101"]) expect(html).toContain(text);
  });

  it("has the three queues with their counts, and no owner, Mine or Nobody anywhere", () => {
    const html = render();
    for (const text of ["Needs reply", "Waiting on customer", "Done"]) expect(html).toContain(text);
    expect(html).not.toMatch(/Owner|Mine|Nobody|Unassigned|Assigned to/);
  });

  it("offers All only where the default queue is all (a client's list), and shows no counts when it has none", () => {
    expect(render()).not.toContain(">All<");
    const client = render({ defaultQueue: "all", queue: "all", counts: null });
    expect(client).toContain("All");
  });

  it("says so when there is nothing to show", () => {
    const html = render({ rows: [] });
    expect(html).toContain("No requests here.");
    expect(html).toContain("how long each has been waiting");
  });

  it("opens the panel on the request in ?open=, with the thread oldest first and the banner that follows the last message", () => {
    const html = render({ openId: "t1", detail: DETAIL });
    expect(html).toContain("Waiting on you");
    expect(html).toContain("The 4 hour promise was missed.");
    expect(html.indexOf("First message")).toBeLessThan(html.indexOf("Our reply"));
    expect(html.indexOf("Our reply")).toBeLessThan(html.indexOf("Follow up"));
    expect(html).toContain("Latest, not answered");
    expect(html).toContain("Send reply");
    expect(html).toContain("Add internal note");
    expect(html).toContain(">Close<");
  });

  it("offers Reopen and reply on a closed (resolved) request, and no public reply on a Closed one", () => {
    expect(render({ openId: "t1", detail: { ...DETAIL, status: "resolved" } })).toContain("Reopen and reply");
    const closed = render({ openId: "t1", detail: { ...DETAIL, status: "closed" } });
    expect(closed).toContain("A closed request cannot get a public reply. Add an internal note.");
  });

  it("says the panel could not load, rather than showing a stale request", () => {
    const html = render({ openId: "t1", detail: null, detailFailedFor: "t1" });
    expect(html).toContain("The request could not be loaded. Nothing was lost.");
    expect(html).toContain("Try again");
  });

  it("shows the change request's moves in the panel of a change request only", () => {
    const withSlot = render({ openId: "t2", detail: { ...DETAIL, id: "t2", type: "change" }, changeSlot: <p>[moves]</p> });
    expect(withSlot).toContain("[moves]");
    expect(render({ openId: "t1", detail: DETAIL, changeSlot: <p>[moves]</p> })).not.toContain("[moves]");
  });
});
