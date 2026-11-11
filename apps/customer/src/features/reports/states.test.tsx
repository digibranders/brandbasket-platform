import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { ReportScreen } from "./components/report-screen";
import { ReportsScreen } from "./components/reports-screen";
import { loadReportMonth, loadReportMonths, type ReportMonthView } from "./loader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_")) throw error;
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadReportMonths: vi.fn(), loadReportMonth: vi.fn() }));

const NOISE = /No data|undefined|\bnull\b|NaN/;
const customer = { businessName: "Apex Diagnostics", businessId: "b1", tenant: {} } as unknown as CustomerContext;
const wrap = (node: ReactNode) => render(<NuqsTestingAdapter>{node}</NuqsTestingAdapter>);
const CONTENT = { headline: "Your website was online 99.98% of the month.", figures: [{ label: "Uptime", value: "99.98%" }], whatWeDid: [] };

beforeEach(() => vi.resetAllMocks());

describe("Reports list states", () => {
  it("a failed read shows its own error and never the empty sentence", async () => {
    vi.mocked(loadReportMonths).mockRejectedValue(new Error("down"));
    wrap(await ReportsScreen({ customer }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your reports.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.queryByText("No report has been sent yet")).toBeNull();
  });

  it("no report yet says when the first one arrives", async () => {
    vi.mocked(loadReportMonths).mockResolvedValue([]);
    const { container } = wrap(await ReportsScreen({ customer }));
    expect(screen.getByText("No report has been sent yet")).toBeTruthy();
    expect(screen.getByText("Your first one appears here after your first full month.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Report month states", () => {
  const sentAt = new Date("2026-11-03T04:00:00Z");
  const view = (services: ReportMonthView["services"]): ReportMonthView => ({ key: "2026-10", title: "October 2026", sentAt, services });

  it("a failed read shows its own error under the month's heading", async () => {
    vi.mocked(loadReportMonth).mockRejectedValue(new Error("down"));
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load this report.");
    expect(screen.getByRole("heading", { name: "October 2026", level: 1 })).toBeTruthy();
  });

  it("one unreadable service says so on its own card and the readable one still draws", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue(view([{ service: "website", content: CONTENT, hasPdf: false }, { service: "social", content: null, hasPdf: false }]));
    const { container } = wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText("Uptime")).toBeTruthy();
    expect(screen.getByText("The month in short")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });

  it("a month where no service is readable is explained on every card, never blank", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue(view([{ service: "website", content: null, hasPdf: false }, { service: "search", content: null, hasPdf: false }]));
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });
});
