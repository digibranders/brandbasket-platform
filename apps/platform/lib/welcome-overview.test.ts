import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: vi.fn(), bookCallSlot: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { WelcomeOverview } from "@/components/first-look/welcome-overview";
import type { ServiceKey } from "@/lib/first-look";

// Tue 27 Oct 2026, 10:00 to 10:30 in India.
const CALL = { startsAtIso: "2026-10-27T04:30:00.000Z", endsAtIso: "2026-10-27T05:00:00.000Z" };
const BOOKING_URL = "https://cal.com/brandbasket/kickoff";

interface Options {
  readonly services?: readonly ServiceKey[];
  readonly payment?: { readonly amount: string; readonly paidOn: string; readonly receiptHref: string } | null;
  readonly call?: { readonly startsAtIso: string | null; readonly endsAtIso: string | null } | null;
  readonly bookingUrl?: string | null;
  readonly canBook?: boolean;
}

/** The overview as the server sends it, with React's text-node separators removed so sentences read whole. */
function render(options: Options): string {
  return renderToStaticMarkup(
    createElement(WelcomeOverview, {
      firstName: "Asha",
      services: options.services ?? ["website"],
      payment: options.payment ?? null,
      call: options.call ?? null,
      bookingUrl: options.bookingUrl ?? null,
      doneSteps: [],
      canBook: options.canBook ?? true,
    }),
  ).replaceAll("<!-- -->", "");
}

it("before booking, with no payment on file, shows no Paid line but the booking card and what to have ready", () => {
  const html = render({ payment: null });
  expect(html).not.toContain("Paid");
  expect(html).toContain("Book your kickoff call");
  expect(html).toContain("Have these ready for the call");
});

it("before booking, tells a customer who cannot book here to add an email, and links the booking page", () => {
  const html = render({ canBook: false, bookingUrl: BOOKING_URL });
  expect(html).toContain("Add an email address in Settings to book here");
  expect(html).toContain(`href="${BOOKING_URL}"`);
  expect(html).toContain("pick a time on our booking page");
});

it("before booking, with no booking page either, ends the sentence with a full stop and no link", () => {
  const html = render({ canBook: false, bookingUrl: null });
  expect(html).toContain("Add an email address in Settings to book here.</p>");
  expect(html).not.toContain(BOOKING_URL);
  expect(html).not.toContain("pick a time on our booking page");
});

it("for a booking without a reported time, points to the confirmation email and offers no calendar file", () => {
  const html = render({ call: { startsAtIso: null, endsAtIso: null } });
  expect(html).toContain("Kickoff call booked");
  expect(html).toContain("The time is in your confirmation email");
  expect(html).not.toContain("Add to calendar");
});

it("for a booked call, shows its time, the calendar file and the dated rows of What happens next", () => {
  const html = render({ call: CALL, services: ["website"] });
  expect(html).toContain("Kickoff call booked");
  expect(html).toContain("Tue 27 Oct, 10:00");
  expect(html).toContain("Add to calendar");
  expect(html).toContain("By Thu 29 Oct");
  expect(html).toContain("By Thu 5 Nov");
  expect(html).toContain("Your website is live");
});

it("for a plan without the website, the timeline says work starts and never promises a live website", () => {
  const html = render({ call: CALL, services: ["social"] });
  expect(html).toContain("We start work");
  expect(html).not.toContain("Your website is live");
});
