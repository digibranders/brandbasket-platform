import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import type { ComingUp, HomePanels, HomeStateView, IncludedEdits, ServiceLine, StripFigures } from "../loader";
import type { ActivityRow, EnquirySeries, NeedsYouItem } from "../rules";
import type { ChecklistSummary } from "@/features/checklist/loader";
import { HomeScreen } from "./home-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/", unstable_rethrow: vi.fn() }));
vi.mock("@/features/conversions/components/purchase-push", () => ({ PurchasePush: () => null }));

const NOW = new Date("2026-11-04T06:00:00.000Z");
const FAILED = { ok: false, error: { at: NOW } } as const;
const ok = <T,>(data: T) => ({ ok: true, data }) as const;

const NEEDS: readonly NeedsYouItem[] = [{ key: "billing", label: "We could not take your last payment", hint: "We will try again.", service: null, href: "/billing/payment", action: "Change payment method" }];
const SERIES: EnquirySeries = { labels: ["Mon 2 Nov", "Tue 3 Nov"], current: [1, 2], previous: [0, 1], currentTotal: 3, previousTotal: 1 };
const FIGURES: StripFigures = { month: "November", adLeads: { count: 5, updatedAt: NOW }, pageOne: null };
const SERVICES: readonly ServiceLine[] = [{ service: "website", line: "Live", needsYou: false }];
const ACTIVITY: readonly ActivityRow[] = [{ key: "a1", at: NOW, label: "Published a blog post", service: "website" }];
const COMING: ComingUp = { call: null, postsThisWeek: 2, payment: null };
const INCLUDED: IncludedEdits = { used: 1, allowed: 2, resetsAt: new Date("2026-12-01T00:00:00.000Z") };
const CHECKLIST: ChecklistSummary = { done: 0, total: 1, items: [{ key: "logo", label: "Add your logo", service: "website", done: false, href: "/checklist?item=logo" }] };

const PERSON = { name: "Anand Verma", isPhoneAccount: false, role: "owner" } as const;
const view = (state: HomeStateView["state"], layout: HomeStateView["layout"]): HomeStateView => ({ state, layout, kickoff: null, project: null, live: null, callsOpen: false });
const BOOKING = ok({ bookingUrl: null, canBook: false, options: [] });

const overviewPanels = (over: Partial<HomePanels> = {}): HomePanels => ({
  booking: BOOKING,
  checklist: null,
  needs: ok(NEEDS),
  enquiries: ok(SERIES),
  figures: ok(FIGURES),
  services: ok(SERVICES),
  activity: ok(ACTIVITY),
  coming: ok(COMING),
  included: ok(INCLUDED),
  ...over,
});

function show(layout: HomeStateView["layout"], state: HomeStateView["state"], panels: HomePanels) {
  return render(
    <ToastProvider>
      <HomeScreen person={PERSON} services={["website", "social"]} view={view(state, layout)} panels={panels} now={NOW} purchase={null} />
    </ToastProvider>,
  );
}

const NOISE = /No data|undefined|\bnull\b|NaN/;

/** Overview: every panel is its own Loaded, and each has a heading that must survive the others failing. */
const OVERVIEW_PANELS = [
  { panel: "needs", what: "what needs you", heading: "Needs you" },
  { panel: "enquiries", what: "your enquiries", heading: "Enquiries by day" },
  { panel: "figures", what: "your ad and search figures", heading: "Last 30 days" },
  { panel: "services", what: "your services", heading: "Your services" },
  { panel: "activity", what: "what we did", heading: "What we did" },
  { panel: "coming", what: "what is coming up", heading: "Coming up" },
  { panel: "included", what: "your small edits", heading: "Small edits included this month" },
] as const;

describe("Home overview: one failed panel", () => {
  it.each(OVERVIEW_PANELS)("$panel failed shows its own error and leaves the other panels drawn", ({ panel, what, heading }) => {
    show("overview", { kind: "ongoing" }, overviewPanels({ [panel]: FAILED }));
    expect(screen.getAllByText(`We could not load ${what}.`).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
    for (const other of OVERVIEW_PANELS.filter((entry) => entry.panel !== panel && entry.panel !== "enquiries")) {
      // Enquiries and the strip share one source, so the strip's own heading is checked by the "figures" row.
      expect(screen.getAllByRole("heading", { name: new RegExp(other.heading) }).length, `${other.heading} still drawn`).toBeGreaterThan(0);
    }
    // The failed panel's heading is still there too: it is never silently hidden.
    expect(screen.getAllByRole("heading", { name: new RegExp(heading) }).length).toBeGreaterThan(0);
  });

  it("keeps the strip's other number when only the ad and search figures failed", () => {
    show("overview", { kind: "ongoing" }, overviewPanels({ figures: FAILED }));
    expect(screen.getByText("Enquiries")).toBeTruthy();
    expect(screen.getByText("We could not load your ad and search figures.")).toBeTruthy();
  });
});

describe("Home overview: every panel ok but empty", () => {
  it("says why each panel is empty and never shows 'No data'", () => {
    const { container } = show(
      "overview",
      { kind: "ongoing" },
      overviewPanels({
        needs: ok([]),
        enquiries: ok({ labels: SERIES.labels, current: [0, 0], previous: [0, 0], currentTotal: 0, previousTotal: 0 }),
        figures: ok({ month: "November", adLeads: null, pageOne: null }),
        services: ok([]),
        activity: ok([]),
        coming: ok({ call: null, postsThisWeek: 0, payment: null }),
        included: ok(null),
      }),
    );
    expect(screen.getByText("Nothing needed from you right now")).toBeTruthy();
    expect(screen.getByText("No services yet")).toBeTruthy();
    expect(screen.getByText("Nothing to show yet")).toBeTruthy();
    expect(screen.getByText("Nothing booked yet")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Home progress and review layouts", () => {
  const progress = { kind: "building", dueAt: null } as const;
  it.each([
    { panel: "needs", what: "what needs you" },
    { panel: "activity", what: "what we did" },
    { panel: "coming", what: "what is coming up" },
    { panel: "included", what: "your small edits" },
  ] as const)("progress layout: $panel failed shows its own error", ({ panel, what }) => {
    show("progress", progress, overviewPanels({ [panel]: FAILED }));
    expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("progress layout: empty panels say what will appear", () => {
    const { container } = show("progress", progress, overviewPanels({ needs: ok([]), activity: ok([]), coming: ok({ call: null, postsThisWeek: 0, payment: null }), included: ok(null) }));
    expect(screen.getByText("Nothing needed from you right now")).toBeTruthy();
    expect(screen.getByText("Nothing to show yet")).toBeTruthy();
    expect(screen.getByText("Nothing booked yet")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });

  it.each([
    { panel: "needs", what: "what needs you" },
    { panel: "activity", what: "what we did" },
  ] as const)("review layout: $panel failed shows its own error", ({ panel, what }) => {
    show("review", { kind: "preview_ready" }, overviewPanels({ [panel]: FAILED }));
    expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
  });

  it("review layout: the preview lead item keeps Needs you from being called empty", () => {
    show("review", { kind: "preview_ready" }, overviewPanels({ needs: ok([]), activity: ok([]) }));
    expect(screen.getByText("Check your website preview")).toBeTruthy();
    expect(screen.queryByText("Nothing needed from you right now")).toBeNull();
    expect(screen.getByText("Nothing to show yet")).toBeTruthy();
  });
});

describe("Home kickoff layout", () => {
  const booked = { kind: "kickoff_booked", startsAt: new Date("2026-11-06T10:00:00Z"), endsAt: new Date("2026-11-06T10:30:00Z") } as const;
  it("a failed checklist shows its own error beside the kickoff panel", () => {
    show("task", booked, overviewPanels({ checklist: FAILED }));
    expect(screen.getByText("We could not load your checklist.")).toBeTruthy();
  });

  it("an empty checklist says there is nothing to get ready", () => {
    show("task", booked, overviewPanels({ checklist: ok({ items: [], done: 0, total: 0 }) }));
    expect(screen.getByText("Nothing to get ready")).toBeTruthy();
  });

  it("a failed booking read still draws the kickoff panel", () => {
    show("task", { kind: "kickoff_unbooked", missedAt: null }, overviewPanels({ booking: FAILED, checklist: ok(CHECKLIST) }));
    expect(screen.getAllByRole("heading", { level: 1 }).length).toBe(1);
  });
});
