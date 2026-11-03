import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import type { HomePanels, HomeStateView, StripFigures } from "../loader";
import type { EnquirySeries, NeedsYouItem } from "../rules";
import { HomeScreen } from "./home-screen";
import { LastThirtyDays, RoundsPanel } from "./panels";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/", unstable_rethrow: vi.fn() }));
vi.mock("@/features/conversions/components/purchase-push", () => ({ PurchasePush: () => null }));

const NOW = new Date("2026-11-04T06:00:00.000Z");
const series = (current: number, previous: number): { ok: true; data: EnquirySeries } => ({
  ok: true,
  data: { labels: [], current: [], previous: [], currentTotal: current, previousTotal: previous },
});
const figures = (data: Partial<StripFigures> = {}): { ok: true; data: StripFigures } => ({ ok: true, data: { month: "November", adLeads: null, pageOne: null, ...data } });

describe("LastThirtyDays", () => {
  it("shows Leads from ads and Google page one when they were measured, and no visits while the switch is off", () => {
    render(
      <LastThirtyDays
        series={series(63, 40)}
        figures={figures({ adLeads: { count: 5, updatedAt: NOW }, pageOne: { count: 10, change: "Up from 8", diff: 2, checkedAt: NOW } })}
        visits={null}
      />,
    );
    expect(screen.getByText("Leads from ads")).toBeTruthy();
    expect(screen.getByText(/From your ads this month \(reported by us\)/)).toBeTruthy();
    expect(screen.getByText("Google page one")).toBeTruthy();
    expect(screen.queryByText("Website visits")).toBeNull();
    expect(screen.getByText("+23")).toBeTruthy();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  it("shows Visits with its period, change and date once a day has been counted, and nothing for a source with no days", () => {
    const summary = { source: "own" as const, total: 3184, change: 12, period: "Last 30 days", days: [], updatedAt: NOW };
    render(<LastThirtyDays series={series(63, 40)} figures={figures()} visits={{ ok: true, data: { summary, lists: null } }} />);
    expect(screen.getByText("Visits")).toBeTruthy();
    expect(screen.getByText("3,184")).toBeTruthy();
    expect(screen.getByText("+12%")).toBeTruthy();
    expect(screen.getByText(/Last 30 days\. Updated/)).toBeTruthy();
  });

  it("draws no Visits figure when no day was counted, and says so when the read failed", () => {
    const { unmount } = render(<LastThirtyDays series={series(63, 40)} figures={figures()} visits={{ ok: true, data: null }} />);
    expect(screen.queryByText("Visits")).toBeNull();
    unmount();
    render(<LastThirtyDays series={series(63, 40)} figures={figures()} visits={{ ok: false, error: { at: NOW } as never }} />);
    expect(screen.getByText(/We could not load your visits/)).toBeTruthy();
  });

  it("leaves out what is not known and any change with nothing to compare", () => {
    render(<LastThirtyDays series={series(63, 0)} figures={figures()} visits={null} />);
    expect(screen.getByText("Enquiries")).toBeTruthy();
    expect(screen.queryByText("Leads from ads")).toBeNull();
    expect(screen.queryByText("Google page one")).toBeNull();
    expect(screen.queryByText("+63")).toBeNull();
  });

  it("never shows a bare 0 change", () => {
    // A change is drawn in a type-label span; the values are not.
    const { container } = render(<LastThirtyDays series={series(0, 0)} figures={figures({ pageOne: { count: 6, change: "Same as last month", diff: 0, checkedAt: NOW } })} visits={null} />);
    expect(container.querySelector(".type-label")).toBeNull();
  });

  it("draws nothing when there is nothing to show", () => {
    const { container } = render(<LastThirtyDays series={null} figures={figures()} visits={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("RoundsPanel", () => {
  it("says the plan includes two rounds beside '1 of 2 used'", () => {
    render(<RoundsPanel project={{ slaDueAt: null, previewSentAt: null, launchPlannedOn: null, revisionRoundsIncluded: 2, revisionRoundsGranted: 1 }} />);
    expect(screen.getByText("2 rounds of changes are included.")).toBeTruthy();
    expect(screen.getByText("1 of 2 used")).toBeTruthy();
  });
});

describe("HomeScreen", () => {
  const person = { name: "Anand Verma", isPhoneAccount: false, role: "owner" as const };
  const panels = (over: Partial<HomePanels> = {}): HomePanels => ({
    booking: { ok: true, data: { bookingUrl: null, canBook: true, options: [] } },
    checklist: null,
    needs: null,
    enquiries: null,
    figures: null,
    visits: null,
    services: null,
    activity: null,
    coming: null,
    included: null,
    ...over,
  });
  const view = (state: HomeStateView["state"], layout: HomeStateView["layout"]): HomeStateView => ({ state, layout, kickoff: null, project: null, live: null, callsOpen: false });
  const show = (props: { state: HomeStateView["state"]; layout: HomeStateView["layout"]; panels?: HomePanels; role?: "owner" | "viewer" }) =>
    render(
      <ToastProvider>
        <HomeScreen person={{ ...person, role: props.role ?? "owner" }} services={["website", "social"]} view={view(props.state, props.layout)} panels={props.panels ?? panels()} now={NOW} purchase={null} />
      </ToastProvider>,
    );

  it("does not say the services are active when the plan has ended", () => {
    show({ state: { kind: "lapsed" }, layout: "task" });
    expect(screen.getByText("Your plan has ended. Reactivate it to restart your services.")).toBeTruthy();
    expect(screen.queryByText(/are active/)).toBeNull();
  });

  const billing: NeedsYouItem = { key: "billing", label: "We could not take your last payment", hint: "We will try again.", service: null, href: "/billing/payment", action: "Change payment method" };

  it("shows the billing task, not 'Everything is running', while a renewal is failing", () => {
    show({ state: { kind: "ongoing" }, layout: "overview", panels: panels({ needs: { ok: true, data: [billing] } }) });
    expect(screen.getByText("1 thing needs you.")).toBeTruthy();
    expect(screen.queryByText(/Everything is running/)).toBeNull();
    expect(screen.getByRole("link", { name: "Change payment method" }).getAttribute("href")).toBe("/billing/payment");
  });

  it("claims nothing about what needs a viewer, who has no Needs you", () => {
    show({ state: { kind: "ongoing" }, layout: "overview", role: "viewer" });
    expect(screen.queryByText(/Everything is running/)).toBeNull();
    expect(screen.queryByText("Needs you")).toBeNull();
    expect(screen.queryByRole("link", { name: "New request" })).toBeNull();
  });
});
