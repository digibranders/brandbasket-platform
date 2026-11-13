import { listSentReports, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SentReport } from "@/lib/reports/rules";
import { reportServerError } from "./error-report";
import { loadReportMonth, loadReportMonths, loadReportPdf } from "./reports";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("./error-report", () => ({ reportServerError: vi.fn() }));
vi.mock("@brandbasket/db", () => ({ listSentReports: vi.fn(), withTenantScope: vi.fn() }));
const storage = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: () => storage }));

const customer = { tenant: { userId: "u1", businessId: "b1", businessName: "Acme", role: "owner" as const } };
const tx = { name: "tx" } as never;
const CONTENT = { headline: "Online all month.", figures: [{ label: "Uptime", value: "99.98%" }], whatWeDid: ["Checked the site"] };
const ID = "01920000-0000-7000-8000-000000000001";

function report(over: Partial<SentReport> = {}): SentReport {
  return { id: "r1", service: "website", month: "2026-10-01", state: "sent", content: CONTENT, contentVersion: 1, pdfKey: null, sentAt: new Date("2026-11-03T04:00:00Z"), ...over };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work(tx));
});

describe("loadReportMonths", () => {
  it("reads through the session's tenant scope and the session's business", async () => {
    vi.mocked(listSentReports).mockResolvedValue([report()] as never);
    const months = await loadReportMonths(customer);
    expect(months.map((month) => month.key)).toEqual(["2026-10"]);
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, customer.tenant, expect.any(Function));
    expect(listSentReports).toHaveBeenCalledWith(tx, "b1");
  });

  it("lets a read failure reach the caller", async () => {
    vi.mocked(listSentReports).mockRejectedValue(new Error("down"));
    await expect(loadReportMonths(customer)).rejects.toThrow("down");
  });
});

describe("loadReportMonth", () => {
  it("is null for a month with no sent report", async () => {
    vi.mocked(listSentReports).mockResolvedValue([report({ month: "2026-09-01" })] as never);
    expect(await loadReportMonth(customer, "2026-10")).toBeNull();
  });

  it("gives each service its readable content and reports one it cannot read", async () => {
    vi.mocked(listSentReports).mockResolvedValue([report(), report({ id: "r2", service: "social", content: {} })] as never);
    const view = await loadReportMonth(customer, "2026-10");
    expect(view?.title).toBe("October 2026");
    expect(view?.services).toEqual([
      { service: "website", content: CONTENT, hasPdf: false },
      { service: "social", content: null, hasPdf: false },
    ]);
    expect(reportServerError).toHaveBeenCalledTimes(1);
  });
});

describe("loadReportPdf", () => {
  it("is null when the report has no stored PDF, or there is no such report", async () => {
    vi.mocked(listSentReports).mockResolvedValue([report()] as never);
    expect(await loadReportPdf(customer, "2026-10", "website")).toBeNull();
    expect(await loadReportPdf(customer, "2026-10", "search")).toBeNull();
    expect(await loadReportPdf(customer, "2026-09", "website")).toBeNull();
  });

  it("gives the stored file of a sent report from the report's own storage key", async () => {
    vi.mocked(listSentReports).mockResolvedValue([report({ id: ID, pdfKey: `reports/${ID}.pdf` })] as never);
    storage.get.mockResolvedValue({ bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" });
    expect(await loadReportPdf(customer, "2026-10", "website")).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(storage.get).toHaveBeenCalledWith(`reports/${ID}/pdf`);
  });

  it("fails loudly when the report has a PDF key but the file is gone", async () => {
    vi.mocked(listSentReports).mockResolvedValue([report({ id: ID, pdfKey: `reports/${ID}.pdf` })] as never);
    storage.get.mockResolvedValue(null);
    await expect(loadReportPdf(customer, "2026-10", "website")).rejects.toThrow("not in storage");
  });
});
