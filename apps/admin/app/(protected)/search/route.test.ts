import { beforeEach, describe, expect, it, vi } from "vitest";
import { runConsoleSearch } from "@/lib/server/console-search";
import { getStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/console-search", () => ({ runConsoleSearch: vi.fn() }));

type Access = Awaited<ReturnType<typeof getStaffAccess>>;
const asStaff = (role: "support" | "finance" | "admin"): Access => ({ kind: "granted", user: { id: "staff-1", name: "Riya Kapoor", email: "riya@example.test" }, staff: { userId: "staff-1", role } }) as Access;
const post = (body: unknown): Request => new Request("http://console.test/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(runConsoleSearch).mockResolvedValue([{ kind: "client", label: "Sai Dental Care", sub: "Priya Sharma", href: "/clients/b1" }]);
});

describe("POST /search", () => {
  it("refuses anyone without staff access", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "signed-out" } as Access);
    const response = await POST(post({ q: "sai" }));
    expect(response.status).toBe(401);
    expect(runConsoleSearch).not.toHaveBeenCalled();
  });

  it("answers an empty list for a term too short to search, without logging", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue(asStaff("support"));
    const response = await POST(post({ q: "s" }));
    expect(await response.json()).toEqual({ hits: [] });
    expect(logStaffAccess).not.toHaveBeenCalled();
  });

  it("logs the search and leaves invoices out for support", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue(asStaff("support"));
    const response = await POST(post({ q: " Sai " }));
    expect(await response.json()).toEqual({ hits: [{ kind: "client", label: "Sai Dental Care", sub: "Priya Sharma", href: "/clients/b1" }] });
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-1", action: "search.run" });
    expect(runConsoleSearch).toHaveBeenCalledWith("sai", false);
  });

  it("includes invoices for finance", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue(asStaff("finance"));
    await POST(post({ q: "fy/26" }));
    expect(runConsoleSearch).toHaveBeenCalledWith("fy/26", true);
  });

  it("is never cached", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue(asStaff("admin"));
    const response = await POST(post({ q: "sai" }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
