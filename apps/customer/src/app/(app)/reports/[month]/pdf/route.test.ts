import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadReportPdf } from "@/features/reports/loader";
import { requirePaid } from "@/lib/guards";
import { GET } from "./route";

vi.mock("@/lib/guards", () => ({ requirePaid: vi.fn() }));
vi.mock("@/features/reports/loader", () => ({ loadReportPdf: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("NEXT_")) throw error; } }));

const customer = { tenant: { businessId: "b1" }, businessId: "b1" } as never;
const call = (month: string, query = "?service=website") => GET(new Request(`http://localhost/reports/${month}/pdf${query}`), { params: Promise.resolve({ month }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requirePaid).mockResolvedValue(customer);
});

describe("GET /reports/[month]/pdf", () => {
  it("calls its own guard before reading anything, and sends the guard's redirect on", async () => {
    vi.mocked(requirePaid).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call("2026-10")).rejects.toThrow("NEXT_REDIRECT");
    expect(loadReportPdf).not.toHaveBeenCalled();
  });

  it("is a 404 for a month that is not a month or a service that is not one, without reading", async () => {
    expect((await call("2026-13")).status).toBe(404);
    expect((await call("2026-10", "?service=ads")).status).toBe(404);
    expect((await call("2026-10", "")).status).toBe(404);
    expect(loadReportPdf).not.toHaveBeenCalled();
  });

  it("is a 404 when the session's business has no such sent report (another business's report is just as absent)", async () => {
    vi.mocked(loadReportPdf).mockResolvedValue(null);
    const response = await call("2026-10");
    expect(response.status).toBe(404);
    expect(loadReportPdf).toHaveBeenCalledWith(customer, "2026-10", "website");
  });

  it("serves the stored PDF as a download that is never cached", async () => {
    vi.mocked(loadReportPdf).mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
    const response = await call("2026-10", "?service=search");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="report-2026-10-search.pdf"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("says it could not get the report, with a 500, when the read fails", async () => {
    vi.mocked(loadReportPdf).mockRejectedValue(new Error("down"));
    const response = await call("2026-10");
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("We could not get this report. Try again in a minute.");
  });
});
