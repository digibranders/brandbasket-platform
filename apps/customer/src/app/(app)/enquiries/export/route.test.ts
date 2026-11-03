import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnquiriesForExport } from "@/features/enquiries/loader";
import { requirePaid } from "@/lib/guards";
import { GET } from "./route";

vi.mock("@/lib/guards", () => ({ requirePaid: vi.fn() }));
vi.mock("@/features/enquiries/loader", () => ({ loadEnquiriesForExport: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("NEXT_")) throw error; } }));

const customer = { tenant: { businessId: "b1" }, businessId: "b1" } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requirePaid).mockResolvedValue(customer);
});

describe("GET /enquiries/export", () => {
  it("calls its own guard before reading anything, and sends the guard's redirect on", async () => {
    vi.mocked(requirePaid).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
    expect(loadEnquiriesForExport).not.toHaveBeenCalled();
  });

  it("returns the business's enquiries as a CSV download that is never cached", async () => {
    vi.mocked(loadEnquiriesForExport).mockResolvedValue([
      { id: "1", kind: "chat", source: null, name: "Priya Nair", phone: "98190 55012", email: null, message: null, status: "new", note: null, receivedAt: new Date("2026-11-03T04:00:00Z"), sourceRef: "chatbot_lead:1" },
      { id: "2", kind: "whatsapp_tap", source: "Website", name: null, phone: null, email: null, message: null, status: "new", note: null, receivedAt: new Date("2026-11-02T04:00:00Z"), sourceRef: "site_event:2" },
    ] as never);
    const response = await GET();
    expect(loadEnquiriesForExport).toHaveBeenCalledWith(customer);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="enquiries-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.text();
    expect(body).toContain('"Priya Nair","98190 55012"');
    expect(body).toContain('"Website tap","","Counted"');
  });

  it("says it could not export, with a 500, when the read fails", async () => {
    vi.mocked(loadEnquiriesForExport).mockRejectedValue(new Error("down"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("We could not export your enquiries. Try again in a minute.");
  });
});
