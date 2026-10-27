import { getChangeWithEvents } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { RequestBanner } from "./request-banner";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => ({ ...(await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db")), getChangeWithEvents: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

beforeEach(() => vi.resetAllMocks());

it("says a ticket is a request for a change, where it is, and links to the client page", async () => {
  vi.mocked(getChangeWithEvents).mockResolvedValue({ change: { state: "quoted" }, events: [] } as never);
  const html = renderToStaticMarkup((await RequestBanner({ ticketId: "t1", businessId: BUSINESS })) as never);
  expect(html).toContain("This is a request for a change: Quote sent (customer sees: Quoted).");
  expect(html).toContain(`href="/clients/${BUSINESS}#requests"`);
});

it("shows nothing for a plain ticket, and no link for a ticket with no business", async () => {
  vi.mocked(getChangeWithEvents).mockResolvedValue(null);
  expect(await RequestBanner({ ticketId: "t1", businessId: BUSINESS })).toBeNull();
  vi.mocked(getChangeWithEvents).mockResolvedValue({ change: { state: "requested" }, events: [] } as never);
  expect(renderToStaticMarkup((await RequestBanner({ ticketId: "t1", businessId: null })) as never)).not.toContain("href=");
});
