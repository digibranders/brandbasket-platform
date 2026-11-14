import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ClientDetail, SetupCallBooking } from "@brandbasket/db";
import { CustomerMirrorPanel } from "./customer-mirror-panel";

const NOW = new Date("2026-11-14T10:00:00Z");

function makeClient(status: "building" | "live" | null, subscriptionStatus: "active" | "past_due" | null = "active"): ClientDetail {
  return {
    businessId: "biz-1",
    businessName: "Green Leaf Cafe",
    owner: { id: "u-1", name: "Ananya Patel", email: "ananya@example.com", phone: "+919876543210" },
    currency: "INR",
    tier: "starter",
    tierSetManually: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    completedSteps: [],
    billing: {
      subscription: subscriptionStatus ? { status: subscriptionStatus, paidThroughAt: null, planPriceCents: 299900 } : null,
      firstPayment: null,
    },
    movingTo: null,
    project: status
      ? {
          id: "p-1",
          status,
          onboardingSubmittedAt: null,
          slaDueAt: null,
          previewUrl: status === "live" ? "https://greenleaf.example.com" : null,
          previewSentAt: null,
          revisionRoundsGranted: 1,
          launchedAt: status === "live" ? new Date("2026-11-01T00:00:00Z") : null,
          createdAt: new Date("2026-10-01T00:00:00Z"),
        }
      : null,
  } as unknown as ClientDetail;
}

function makeBooking(startsAt: Date, heldAt: Date | null = null): SetupCallBooking {
  return {
    id: "booking-1",
    businessId: "biz-1",
    inviteeUri: "https://calendly.com/sample",
    bookedAt: new Date("2026-11-10T00:00:00Z"),
    startsAt,
    endsAt: new Date(startsAt.getTime() + 1800000),
    heldAt,
    heldByStaffId: heldAt ? "staff-1" : null,
    summary: null,
    summaryAt: null,
    summaryByStaffId: null,
    createdAt: new Date("2026-11-10T00:00:00Z"),
    updatedAt: new Date("2026-11-10T00:00:00Z"),
  };
}

describe("CustomerMirrorPanel", () => {
  it("renders the mirror panel with section title and customer statuses", () => {
    const client = makeClient("building");
    const booking = makeBooking(new Date("2026-11-15T10:00:00Z"));
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking, now: NOW }));

    expect(html).toContain("What the customer sees");
    expect(html).toContain("Read only mirror");
    expect(html).toContain("We are building your website");
    expect(html).toContain("Plan active");
  });

  it("shows the pre-call customer wording before scheduled call time", () => {
    const client = makeClient("building");
    const futureCall = new Date("2026-11-16T09:30:00Z");
    const booking = makeBooking(futureCall);
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking, now: NOW }));

    expect(html).toContain("Your kickoff call is booked for");
  });

  it("shows the post-call pre-confirmation customer wording after call time has passed", () => {
    const client = makeClient("building");
    const pastCall = new Date("2026-11-14T08:00:00Z");
    const booking = makeBooking(pastCall);
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking, now: NOW }));

    expect(html).toContain("We will start your website right after your call");
  });

  it("shows post-completion wording after call is completed", () => {
    const client = makeClient("building");
    const pastCall = new Date("2026-11-14T08:00:00Z");
    const booking = makeBooking(pastCall, new Date("2026-11-14T08:30:00Z"));
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking, now: NOW }));

    expect(html).toContain("Thanks for the call. We are getting your website started");
    expect(html).not.toContain("held");
  });

  it("handles null project gracefully", () => {
    const client = makeClient(null);
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking: null, now: NOW }));

    expect(html).toContain("No website service active");
    expect(html).toContain("Kickoff call not yet booked");
  });

  it("reflects billing past due status", () => {
    const client = makeClient("live", "past_due");
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking: null, now: NOW }));

    expect(html).toContain("Payment past due");
  });

  it("displays timing window and join meeting link when meeting link is available", () => {
    const client = makeClient("building");
    const futureCall = new Date("2026-11-16T10:00:00Z"); // 3:30 PM IST
    const booking: SetupCallBooking = {
      ...makeBooking(futureCall),
      inviteeUri: "https://api.cal.com/v2/bookings/call-abc-123",
    };
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking, now: NOW }));

    expect(html).toContain("3:30 PM to 4:00 PM");
    expect(html).toContain('href="https://app.cal.com/video/call-abc-123"');
    expect(html).toContain("Join meeting");
  });

  it("does not display join meeting link once the call has been held", () => {
    const client = makeClient("building");
    const pastCall = new Date("2026-11-14T08:00:00Z");
    const booking: SetupCallBooking = {
      ...makeBooking(pastCall, new Date("2026-11-14T08:30:00Z")),
      inviteeUri: "https://api.cal.com/v2/bookings/call-abc-123",
    };
    const html = renderToStaticMarkup(createElement(CustomerMirrorPanel, { client, booking, now: NOW }));

    expect(html).not.toContain("Join meeting");
  });
});
