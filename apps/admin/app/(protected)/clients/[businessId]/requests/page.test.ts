import { listActivityForBusiness, listAssignableSupportStaff, listSupportTicketsForStaff } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openClientTab } from "@/lib/server/client-page";
import ClientRequestsPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/components/console/requests-section", () => ({ RequestsSection: () => "[send request]" }));
vi.mock("@/components/console/calls-section", () => ({ CallsSection: () => "[calls]" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listActivityForBusiness: vi.fn(), listAssignableSupportStaff: vi.fn(), listSupportTicketsForStaff: vi.fn() };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

function activityRows(count: number): never {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    createdAt: new Date("2026-11-02T06:30:00Z"),
    summary: `Did thing ${index}`,
    data: {},
    actorKind: "system",
    actorId: null,
  })) as never;
}

async function render(rows = 2): Promise<string> {
  vi.mocked(openClientTab).mockResolvedValue({ granted: { staff: { role: "support" } }, client: { businessId: BUSINESS } } as never);
  vi.mocked(listSupportTicketsForStaff).mockResolvedValue({ items: [], nextCursor: null } as never);
  vi.mocked(listActivityForBusiness).mockResolvedValue(activityRows(rows));
  vi.mocked(listAssignableSupportStaff).mockResolvedValue([]);
  return renderToStaticMarkup(await ClientRequestsPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve({}) }));
}

beforeEach(() => vi.clearAllMocks());

describe("the Messages tab", () => {
  it("shows the requests first and the activity in a shut fold after them", async () => {
    const html = await render();
    expect(openClientTab).toHaveBeenCalledWith(BUSINESS, "requests");
    expect(html.indexOf("No requests from this client.")).toBeGreaterThan(-1);
    expect(html.indexOf("Did thing 0")).toBeGreaterThan(html.indexOf("No requests from this client."));
    const fold = /<details[^>]*>(?=<summary[^>]*><span[^>]*>Activity)/.exec(html)?.[0] ?? "";
    expect(fold).not.toBe("");
    expect(fold).not.toContain(" open");
  });

  it("can be linked to as #activity", async () => {
    expect(await render()).toContain('id="activity"');
  });

  it("says when the list is cut at the newest 200", async () => {
    expect(await render(2)).not.toContain("200 newest");
    expect(await render(200)).toContain("200 newest");
  });
});
