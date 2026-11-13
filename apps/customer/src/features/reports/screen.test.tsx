import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { ReportScreen } from "./components/report-screen";
import { ReportsScreen } from "./components/reports-screen";
import { loadReportMonth, loadReportMonths, type ReportMonthView } from "./loader";
import { groupSentByMonth, type SentReport } from "./rules";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("NEXT_")) throw error; },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadReportMonths: vi.fn(), loadReportMonth: vi.fn() }));

const customer = { businessName: "Apex Diagnostics", businessId: "b1", tenant: {} } as unknown as CustomerContext;
const CONTENT = { headline: "Your website was online 99.98% of the month.", figures: [{ label: "Uptime", value: "99.98%" }], whatWeDid: ["Published a blog post"] };
const sent: SentReport = { id: "r1", service: "website", month: "2026-10-01", state: "sent", content: CONTENT, contentVersion: 1, pdfKey: null, sentAt: new Date("2026-11-03T04:00:00Z") };
const wrap = (node: ReactNode) => render(<NuqsTestingAdapter>{node}</NuqsTestingAdapter>);

beforeEach(() => vi.resetAllMocks());

describe("Reports list", () => {
  it("lists a sent month with its date and headline, and links it", async () => {
    vi.mocked(loadReportMonths).mockResolvedValue(groupSentByMonth([sent]));
    wrap(await ReportsScreen({ customer }));
    expect(screen.getByRole("link", { name: "October 2026" }).getAttribute("href")).toBe("/reports/2026-10");
    expect(screen.getByText(CONTENT.headline)).toBeTruthy();
    expect(screen.getByText("Tue 3 Nov")).toBeTruthy();
  });

  it("says no report has been sent when there is none, instead of an empty table", async () => {
    vi.mocked(loadReportMonths).mockResolvedValue([]);
    wrap(await ReportsScreen({ customer }));
    expect(screen.getByText("No report has been sent yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the error state, never the empty one, when the read fails", async () => {
    vi.mocked(loadReportMonths).mockRejectedValue(new Error("down"));
    wrap(await ReportsScreen({ customer }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your reports.");
    expect(screen.queryByText("No report has been sent yet")).toBeNull();
  });
});

describe("Report", () => {
  const view = { key: "2026-10", title: "October 2026", sentAt: sent.sentAt as Date, services: [{ service: "website", content: CONTENT, hasPdf: false }] } as unknown as ReportMonthView;

  it("shows a report's ranked lists as panels of their own", async () => {
    const withLists = { ...CONTENT, lists: [{ title: "Top searches that found you in October", rows: [{ label: "physio near me", value: "90 clicks" }] }] };
    vi.mocked(loadReportMonth).mockResolvedValue({ ...view, services: [{ service: "website", content: withLists, hasPdf: false }] } as unknown as ReportMonthView);
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByText("Top searches that found you in October")).toBeTruthy();
    expect(screen.getByText("physio near me")).toBeTruthy();
    expect(screen.getByText("90 clicks")).toBeTruthy();
  });

  it("shows the month in short, the service card and what we did, and no Download PDF without a PDF", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue(view);
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect(screen.getByText("The month in short")).toBeTruthy();
    expect(screen.getByText("Uptime")).toBeTruthy();
    expect(screen.getByText("Published a blog post")).toBeTruthy();
    expect(screen.queryByText("Download PDF")).toBeNull();
  });

  it("offers the PDF for a service that has one", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue({ ...view, services: [{ service: "website", content: CONTENT, hasPdf: true }] });
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByRole("link", { name: /Download PDF/ }).getAttribute("href")).toBe("/reports/2026-10/pdf?service=website");
  });

  it("marks a part it cannot read instead of guessing", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue({ ...view, services: [{ service: "website", content: null, hasPdf: false }] });
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByRole("alert").textContent).toContain("We could not show this part of the report.");
    expect(screen.queryByText("The month in short")).toBeNull();
  });

  it("is a 404 for a month with no sent report", async () => {
    vi.mocked(loadReportMonth).mockResolvedValue(null);
    await expect(ReportScreen({ customer, month: "2026-09" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows the error state, not a 404, when the read fails", async () => {
    vi.mocked(loadReportMonth).mockRejectedValue(new Error("down"));
    wrap(await ReportScreen({ customer, month: "2026-10" }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load this report.");
  });
});
