import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { ReportScreen } from "./components/report-screen";
import { ReportsScreen } from "./components/reports-screen";
import { loadReportMonth, loadReportMonths } from "./loader";
import { groupSentByMonth, type SentReport } from "./rules";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("NEXT_")) throw error; },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadReportMonths: vi.fn(), loadReportMonth: vi.fn() }));

const customer = { businessName: "Apex Diagnostics", businessId: "b1", tenant: {} } as unknown as CustomerContext;
const content = (headline: string) => ({ headline, figures: [{ label: "Uptime", value: "99.98%" }], whatWeDid: [] });
const sent = (month: string, headline: string, day: number): SentReport => ({
  id: month,
  service: "website",
  month,
  state: "sent",
  content: content(headline),
  contentVersion: 1,
  pdfKey: null,
  sentAt: new Date(Date.UTC(2026, 10, day, 4)),
});
const wrap = (node: ReactNode) => render(<NuqsTestingAdapter>{node}</NuqsTestingAdapter>);

beforeEach(() => vi.resetAllMocks());

describe("Reports list focal card", () => {
  it("raises the newest month and keeps older months in a Past reports list", async () => {
    vi.mocked(loadReportMonths).mockResolvedValue(groupSentByMonth([sent("2026-10-01", "October went well.", 3), sent("2026-09-01", "September was steady.", 2)]));
    wrap(await ReportsScreen({ customer }));
    expect(screen.getByRole("heading", { name: "October 2026", level: 2 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open report" }).getAttribute("href")).toBe("/reports/2026-10");
    expect(screen.getByRole("heading", { name: "Past reports" })).toBeTruthy();
    expect(screen.getByText("September was steady.")).toBeTruthy();
  });

  it("shows no Past reports panel when there is only one month", async () => {
    vi.mocked(loadReportMonths).mockResolvedValue(groupSentByMonth([sent("2026-10-01", "October went well.", 3)]));
    wrap(await ReportsScreen({ customer }));
    expect(screen.queryByRole("heading", { name: "Past reports" })).toBeNull();
  });
});

describe("Report figures", () => {
  it("draws each figure as a stat tile with its label and value", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue({ key: "2026-10", title: "October 2026", sentAt: new Date(), services: [{ service: "website", content: content("Online all month."), hasPdf: false }] });
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByText("Uptime")).toBeTruthy();
    expect(screen.getByText("99.98%").className).toContain("font-mono");
  });
});
