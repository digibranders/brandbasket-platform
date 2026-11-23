import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TodayItem } from "@/lib/today-queue";
import { TodayWorkspace, type TodayWorkspaceProps } from "./today-workspace";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(protected)/today-actions", () => ({ resendAllFailedFromTodayAction: vi.fn() }));
vi.mock("@/app/(protected)/calls/kickoff-actions", () => ({ completeKickoffAction: vi.fn(), theyDidNotJoinAction: vi.fn(), rescheduleKickoffAction: vi.fn() }));

// 11:30 on Monday 30 November 2026 in India; the day ends at 18:30 UTC.
const NOW = new Date("2026-11-30T06:00:00.000Z");
const END_OF_TODAY = new Date("2026-11-30T18:30:00.000Z");

const item = (key: string, kind: TodayItem["kind"], title: string, dueAt: Date | null, extra: Partial<TodayItem> = {}): TodayItem => ({ key, kind, href: `/${key}`, title, detail: "", dueAt, ...extra });

const ITEMS: readonly TodayItem[] = [
  item("kickoff:b1", "kickoff", "Did the kickoff happen?", new Date("2026-11-29T06:00:00.000Z"), { href: "/" }),
  item("privacy:p1", "privacy", "Privacy request PR-1", new Date("2026-11-28T06:00:00.000Z"), { href: "/privacy-requests", clock: "request" }),
  item("request:t1", "request", "No reply yet", new Date("2026-11-30T12:30:00.000Z")),
  item("preview_silent:b2", "preview_silent", "Preview sent, no answer: Kumar Opticals", null),
  item("delivery:failed", "delivery", "3 emails and webhooks failed", null),
];

const PROPS: TodayWorkspaceProps = {
  items: ITEMS,
  now: NOW,
  endOfToday: END_OF_TODAY,
  unreadFilters: [],
  incomplete: false,
  kickoffs: [{ businessId: "b1", businessName: "Green Leaf Cafe", endsAt: new Date("2026-11-29T06:00:00.000Z") }],
};

const render = (props: Partial<TodayWorkspaceProps> = {}): string => renderToStaticMarkup(<TodayWorkspace {...PROPS} {...props} />);

describe("TodayWorkspace", () => {
  it("shows the chips with their counts and no Calls chip", () => {
    const html = render();
    for (const label of ["All", "Late", "Customers", "Builds", "Money", "Enquiries", "Compliance", "System"]) expect(html).toContain(`>${label}<`);
    expect(html).not.toContain(">Calls<");
  });

  it("puts the late rows in their own card, with the other bands under it", () => {
    const html = render();
    expect(html).toContain('aria-label="Late"');
    expect(html).toContain("Due today");
    expect(html).toContain("Waiting on someone");
    expect(html).toContain("Upcoming");
    expect(html.indexOf("Did the kickoff happen?")).toBeLessThan(html.indexOf("No reply yet"));
  });

  it("gives each row one verb: Call completed on the kickoff row, Reply on a request, Open on the rest", () => {
    const html = render();
    expect(html).toContain("Call completed");
    expect(html).toContain("Reply");
    expect(html).toContain("Open");
  });

  it("reads the compliance clock in its own units, red only when late", () => {
    const html = render();
    expect(html).toContain("02d 00h overdue");
  });

  it("says nothing needs you only when the lists all read", () => {
    expect(render({ items: [] })).toContain("Nothing needs you right now");
    expect(render({ items: [], incomplete: true })).not.toContain("Nothing needs you right now");
  });

  it("shows a ? on a chip whose source failed", () => {
    expect(render({ unreadFilters: ["compliance"] })).toContain(">?<");
  });
});
