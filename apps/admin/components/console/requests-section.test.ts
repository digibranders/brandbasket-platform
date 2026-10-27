import { countIncludedEdits, listChangeRequestsForBusiness, type StaffRequestItem } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestPricing } from "@/lib/server/request-pricing";
import { RequestsSection } from "./requests-section";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, countIncludedEdits: vi.fn(), listChangeRequestsForBusiness: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/lib/server/request-pricing", () => ({ requestPricing: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/request-actions", () => ({ moveRequestAction: vi.fn(), sendQuoteAction: vi.fn(), startWithoutQuoteAction: vi.fn() }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const QUOTE = { what: "New page", hours: 3, unitCents: 50_000, amountCents: 150_000, currency: "INR" as const, workingDays: 5, quotedAt: new Date("2026-11-28T04:50:00.000Z") };

function item(overrides: Partial<StaffRequestItem["change"]> = {}, subject = "Add an Implants page"): StaffRequestItem {
  return {
    ticketId: "ticket-1",
    displayRef: "FY-1",
    subject,
    ticketStatus: "new",
    createdAt: new Date("2026-11-27T12:30:00.000Z"),
    change: {
      id: "request-1",
      ticketId: "ticket-1",
      businessId: BUSINESS,
      kind: "website",
      page: "Home",
      state: "requested",
      coverage: "undecided",
      quote: null,
      acceptedAt: null,
      chargeId: null,
      chargeStatus: null,
      closedReason: null,
      createdAt: new Date("2026-11-27T12:30:00.000Z"),
      updatedAt: new Date("2026-11-27T12:30:00.000Z"),
      ...overrides,
    },
  };
}

async function render(notice: Parameters<typeof RequestsSection>[0]["notice"] = null, mail: Parameters<typeof RequestsSection>[0]["mail"] = null): Promise<string> {
  return renderToStaticMarkup(await RequestsSection({ businessId: BUSINESS, notice, mail })).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([]);
  vi.mocked(countIncludedEdits).mockResolvedValue(1);
  vi.mocked(requestPricing).mockResolvedValue({ unitCents: 50_000, currency: "INR", includedAllowed: 2 });
});

describe("RequestsSection", () => {
  it("says so when there are no requests, and how many included edits are used", async () => {
    const html = await render();
    expect(html).toContain('id="requests"');
    expect(html).toContain("No requests yet.");
    expect(html).toContain("Included edits this month: 1 of 2 used.");
  });

  it("says a plan has no included edits when it has none", async () => {
    vi.mocked(requestPricing).mockResolvedValue({ unitCents: 50_000, currency: "INR", includedAllowed: 0 });
    expect(await render()).toContain("This plan has no included edits.");
  });

  it("shows a new request open, with the page, the date, both words for its state and every way to move it", async () => {
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item()]);
    const html = await render();
    expect(html).toContain("Add an Implants page");
    expect(html).toContain("Website, Home");
    expect(html).toContain("Waiting for us (customer sees: Sent)");
    expect(html).toContain('href="/support/ticket-1"');
    expect(html).toContain("1 waiting for us");
    expect(html).toMatch(/<details class="mt-3" open="">/);
    for (const text of ["Send a quote", "Send quote", "Start as an included edit", "Start at no charge", "Decline"]) expect(html).toContain(text);
    expect(html).toContain("₹500 an hour, taken from their plan.");
    expect(html).toContain('name="hours"');
    expect(html).not.toContain('name="unitCents"');
  });

  it("hides the included edit when none are left, or the change is not a website change", async () => {
    vi.mocked(countIncludedEdits).mockResolvedValue(2);
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item()]);
    expect(await render()).not.toContain("Start as an included edit");
    vi.mocked(countIncludedEdits).mockResolvedValue(0);
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ kind: "billing" })]);
    const html = await render();
    expect(html).not.toContain("Start as an included edit");
    expect(html).toContain("Start at no charge");
  });

  it("shows a quote with what it was for and whether the customer has accepted it", async () => {
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ state: "quoted", coverage: "paid", quote: QUOTE })]);
    expect(await render()).toContain("Quote: New page, 3 hours, ₹1,500, ready 5 working days after payment. Not accepted yet.");
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ state: "quoted", coverage: "paid", quote: QUOTE, acceptedAt: new Date("2026-11-29T05:00:00.000Z"), chargeId: "c1", chargeStatus: "open" })]);
    const html = await render();
    expect(html).toContain("Accepted 29 Nov 2026; charge open.");
    expect(html).toContain("Send a new quote");
    expect(html).not.toContain("Start at no charge");
  });

  it("offers work that has started: send for checking, mark done and decline", async () => {
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ state: "in_progress", coverage: "free" })]);
    const html = await render();
    expect(html).toContain("Send for checking");
    expect(html).toContain("Mark done");
    expect(html).toContain("Decline");
    expect(html).not.toContain("Send quote");
  });

  it("warns that declining work the customer has paid for does not refund it", async () => {
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ state: "in_progress", coverage: "paid", quote: QUOTE, acceptedAt: new Date("2026-11-29T05:00:00.000Z"), chargeId: "c1", chargeStatus: "paid" })]);
    expect(await render()).toContain("The customer has paid for this. Declining does not refund it: refund them yourself.");
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ state: "in_progress", coverage: "free" })]);
    expect(await render()).not.toContain("Declining does not refund it");
  });

  it("offers nothing on a request that is done, and shows why a declined one was declined", async () => {
    vi.mocked(listChangeRequestsForBusiness).mockResolvedValue([item({ state: "shipped", coverage: "free" }), item({ state: "declined", closedReason: "We do not build online shops." }, "A shop")].map((entry, index) => ({ ...entry, change: { ...entry.change, id: `request-${index}` } })));
    const html = await render();
    expect(html).not.toContain("What to do with it");
    expect(html).toContain("Reason given: We do not build online shops.");
  });

  it("says what just happened, and whether the customer was told", async () => {
    expect(await render("quoted", "emailed")).toContain("Quote sent. The customer was emailed.");
    expect(await render("finished", "no-email")).toContain("They have no email address, so tell them another way.");
    expect(await render("moved", null)).toContain("already moved on");
  });
});
