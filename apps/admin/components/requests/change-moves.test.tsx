import type { ChangeView } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeMoves } from "./change-moves";

vi.mock("@/app/(protected)/clients/[businessId]/request-actions", () => ({ moveRequestAction: vi.fn(), sendQuoteAction: vi.fn(), startWithoutQuoteAction: vi.fn() }));

const BASE: ChangeView = {
  id: "c1",
  ticketId: "t1",
  businessId: "b1",
  kind: "website",
  page: "Home",
  state: "requested",
  coverage: "undecided",
  quote: null,
  acceptedAt: null,
  chargeId: null,
  chargeStatus: null,
  closedReason: null,
  createdAt: new Date("2026-11-17T06:30:00.000Z"),
  updatedAt: new Date("2026-11-17T06:30:00.000Z"),
};
const PRICING = { unitCents: 50_000, currency: "INR", includedAllowed: 2 } as const;

function render(change: ChangeView, used = 1): string {
  return renderToStaticMarkup(<ChangeMoves change={change} requesterName="Asha" pricing={PRICING} includedUsed={used} />).replaceAll("<!-- -->", "");
}

describe("ChangeMoves", () => {
  it("names the email for every move of a new request, and says a sent email cannot be unsent", () => {
    const html = render(BASE);
    expect(html).toContain("Every move below emails Asha.");
    for (const text of ["Email the quote to Asha?", "Start this as an included edit?", "Start this at no charge?", "Decline this change?", "Asha is emailed that the work has started. No payment is asked for.", "A sent email cannot be unsent."]) expect(html).toContain(text);
    expect(html).toContain("₹500 an hour, taken from their plan.");
    expect(html).toContain("Included edits");
  });

  it("offers only the moves the state allows", () => {
    const html = render({ ...BASE, state: "in_progress", coverage: "free" });
    expect(html).toContain("Send this for checking?");
    expect(html).toContain("Mark this done?");
    expect(html).not.toContain("Email the quote to Asha?");
  });

  it("offers nothing to do with a finished request, and shows why it was declined", () => {
    const html = render({ ...BASE, state: "declined", closedReason: "Out of scope" });
    expect(html).not.toContain("Every move below");
    expect(html).toContain("Out of scope");
  });

  it("warns that declining a paid request does not refund it", () => {
    expect(render({ ...BASE, state: "in_progress", coverage: "paid", chargeStatus: "paid" })).toContain("declining does not refund it: refund them yourself.");
  });
});
