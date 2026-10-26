import { listActivityEvents } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UpdatesSection } from "./updates-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, listActivityEvents: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/app/(protected)/clients/[businessId]/updates-actions", () => ({
  addUpdateAction: vi.fn(),
  removeUpdateAction: vi.fn(),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const EVENT = "01a0f71b-8402-7d48-a90a-207e8c8a8999";

async function render(notice: "added" | "removed" | "invalid" | null = null): Promise<string> {
  return renderToStaticMarkup(await UpdatesSection({ businessId: BUSINESS, notice }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listActivityEvents).mockResolvedValue([]);
});

describe("UpdatesSection", () => {
  it("shows the add form with the title limit and no Remove button while there are no updates", async () => {
    const html = await render();
    expect(html).toContain('id="updates"');
    expect(html).toContain("Updates for the customer");
    expect(html).toContain('maxLength="140"');
    expect(html).toContain('name="title"');
    expect(html).toContain('name="date"');
    expect(html).toContain("Social &amp; Ads");
    expect(html).toContain("Add update");
    expect(html).toContain(`name="businessId" value="${BUSINESS}"`);
    expect(html).not.toContain(">Remove<");
    expect(listActivityEvents).toHaveBeenCalledWith({ db: true }, BUSINESS, 8);
  });

  it("lists each update with its India date, service and title, and a Remove form of its own", async () => {
    vi.mocked(listActivityEvents).mockResolvedValue([
      { id: EVENT, service: "social", title: "Posted three reels", occurredAt: new Date("2026-10-20T06:30:00Z") },
      { id: "01a0f71b-8402-7d48-a90a-207e8c8a8998", service: null, title: "Monthly check done", occurredAt: new Date("2026-10-19T06:30:00Z") },
    ] as never);
    const html = await render();
    expect(html).toContain("20 October 2026");
    expect(html).toContain("Social &amp; Ads");
    expect(html).toContain("Posted three reels");
    expect(html).toContain("General");
    expect(html).toContain(`name="id" value="${EVENT}"`);
    expect(html.match(/>Remove</g)).toHaveLength(2);
  });

  it("shows the notice for what just happened", async () => {
    expect(await render("added")).toContain("Update added.");
    expect(await render("removed")).toContain("Update removed.");
    expect(await render("invalid")).toContain("Check the update: 3 to 140 characters, and a date that is not in the future.");
    expect(await render(null)).not.toContain('role="status"');
  });
});
