import type { Lead } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";
import { loadEnquiryScreen } from "@/lib/server/enquiries-screen";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccessOrThrow: vi.fn() }));
vi.mock("@/lib/server/enquiries-screen", () => ({ loadEnquiryScreen: vi.fn() }));

const LEAD = {
  id: "lead-1",
  name: "Neha Joshi",
  businessName: "Green Leaf Cafe",
  email: "neha@example.com",
  phone: null,
  status: "new",
  source: "website_form",
  plans: [],
  city: null,
  assignedStaffId: null,
  createdAt: new Date("2026-11-30T09:12:00.000Z"),
} as unknown as Lead;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted", user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as Awaited<ReturnType<typeof getStaffAccess>>);
  vi.mocked(loadEnquiryScreen).mockResolvedValue({ all: [LEAD], rows: [LEAD], staff: [], ownerNames: new Map(), now: new Date(), weekCount: 1, toContactCount: 1 });
});

describe("GET /leads/export", () => {
  it("refuses anyone without staff access, before reading anything", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "signed-out" });
    expect((await GET(new Request("http://console.test/leads/export"))).status).toBe(401);
    expect(loadEnquiryScreen).not.toHaveBeenCalled();
  });

  it("exports the enquiries the list shows, after logging it", async () => {
    const response = await GET(new Request("http://console.test/leads/export?view=all&source=website_form"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(loadEnquiryScreen).toHaveBeenCalledWith({ bucket: "all", source: "website_form", owner: "anyone", search: "" }, "staff-1");
    expect(logStaffAccessOrThrow).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "lead.export", targetType: "leads", detail: "rows=1" });
    expect(await response.text()).toContain("Green Leaf Cafe");
  });

  it("sends nothing when the export cannot be logged", async () => {
    vi.mocked(logStaffAccessOrThrow).mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await GET(new Request("http://console.test/leads/export"))).status).toBe(500);
  });
});
