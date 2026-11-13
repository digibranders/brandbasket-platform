import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerBilling, getCustomerBusinessEntry } from "@/lib/server/customer-access";
import { getCustomerAccess } from "@/lib/server/customer-tenant";
import { loadEnquiriesForExport } from "@/lib/server/enquiries";
import { consumeRateLimit } from "@brandbasket/db";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ getCustomerBilling: vi.fn(), getCustomerBusinessEntry: vi.fn() }));
vi.mock("@/lib/server/enquiries", () => ({ loadEnquiriesForExport: vi.fn() }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn(async () => null) }));

const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" };
const granted = { kind: "granted", user: { id: "user-a" }, tenant } as never;

function record(overrides: Record<string, unknown> = {}): never {
  return {
    id: "0192f3c4-0000-7000-8000-0000000000aa",
    kind: "form",
    source: null,
    name: "=cmd|' /C calc'!A0",
    phone: null,
    email: null,
    message: "Hello",
    status: "new",
    note: null,
    receivedAt: new Date("2026-11-12T06:00:00.000Z"),
    sourceRef: "form:1",
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCustomerAccess).mockResolvedValue(granted);
  vi.mocked(getCustomerBusinessEntry).mockResolvedValue({ kind: "website" } as never);
  vi.mocked(getCustomerBilling).mockResolvedValue({ hasAccess: true, hasWebsite: true } as never);
  vi.mocked(loadEnquiriesForExport).mockResolvedValue([record()]);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
});

describe("GET /website/enquiries/export", () => {
  it("answers 401 and reads nothing for someone signed out or closing", async () => {
    vi.mocked(getCustomerAccess).mockResolvedValue({ kind: "none" } as never);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(loadEnquiriesForExport).not.toHaveBeenCalled();
  });

  it("answers 403 for a listing account and for a paid plan without the website", async () => {
    vi.mocked(getCustomerBusinessEntry).mockResolvedValue({ kind: "listing" } as never);
    expect((await GET()).status).toBe(403);
    vi.mocked(getCustomerBusinessEntry).mockResolvedValue({ kind: "website" } as never);
    vi.mocked(getCustomerBilling).mockResolvedValue({ hasAccess: true, hasWebsite: false } as never);
    expect((await GET()).status).toBe(403);
    expect(loadEnquiriesForExport).not.toHaveBeenCalled();
  });

  it("lets a lapsed customer keep reading", async () => {
    vi.mocked(getCustomerBilling).mockResolvedValue({ hasAccess: false, hasWebsite: false } as never);
    expect((await GET()).status).toBe(200);
  });

  it("reads the session's business and sends a private, uncached CSV download with formulas neutralised", async () => {
    const response = await GET();
    expect(loadEnquiriesForExport).toHaveBeenCalledWith({ tenant });
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="enquiries-\d{4}-\d{2}-\d{2}\.csv"$/);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // text() would strip the byte order mark, so it is read from the bytes.
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain(`"'=cmd|' /C calc'!A0"`);
  });

  it("allows 10 exports an hour per business, keyed on the session's business", async () => {
    await GET();
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), "enquiries-export:business:business-1", { limit: 10, windowSeconds: 3600 });
  });

  it("answers 429 with Retry-After once the hour's exports are spent, and reads nothing", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const response = await GET();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1800");
    expect(loadEnquiriesForExport).not.toHaveBeenCalled();
  });

  it("answers 500 in plain words when the read fails", async () => {
    vi.mocked(loadEnquiriesForExport).mockRejectedValue(new Error("db down"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("We could not export your enquiries. Try again in a minute.");
  });
});
