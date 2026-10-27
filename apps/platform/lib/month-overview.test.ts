import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/requests/calls/actions", () => ({ bookCallAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: vi.fn() }));

import { MonthOverview } from "@/components/overview/month-overview";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { ServiceKey } from "@/lib/first-look";
import type { OverviewData } from "@/lib/server/overview";
import type { TodoItem } from "@/lib/todo";

// Tue 3 Nov 2026, 10:00 in India.
const NOW = new Date("2026-11-03T04:30:00.000Z");

function item(index: number, overrides: Partial<TodoItem> = {}): TodoItem {
  return {
    key: `item-${index}`,
    label: `Thing ${index}`,
    hint: `Hint ${index}`,
    service: "website",
    done: false,
    kind: "link",
    href: `/onboarding/step-${index}`,
    ...overrides,
  } as TodoItem;
}

function data(overrides: Partial<OverviewData> = {}): OverviewData {
  const todo = overrides.todo ?? [];
  const requests = overrides.requests ?? [];
  return {
    services: ["website", "social"] satisfies ServiceKey[],
    open: todo.filter((entry) => !entry.done).length + requests.length,
    todo,
    requests,
    included: null,
    results: [],
    activity: [],
    nextPayment: null,
    nextCall: null,
    ...overrides,
  };
}

/** The overview as the server sends it, with React's text-node separators removed so sentences read whole. */
function render(overview: OverviewData, extra: { readonly bookingUrl?: string | null; readonly canBook?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(MonthOverview, {
      firstName: "Priya",
      businessName: "Sai Dental Care",
      data: overview,
      now: NOW,
      buildCard: null,
      bookingUrl: extra.bookingUrl ?? null,
      callOptions: [
        { value: "website", label: "Website" },
        { value: "billing", label: "Billing" },
        { value: "other", label: "Something else" },
      ],
      canBook: extra.canBook ?? true,
    }),
  ).replaceAll("<!-- -->", "");
}

it("greets by name with the subline for the open count, and offers a change request", () => {
  const html = render(data({ todo: [item(1), item(2)] }));
  expect(html).toContain("Good morning, Priya.");
  expect(html).toContain("Everything is running. 2 things need you.");
  expect(html).toContain('href="/requests/new"');
  expect(html).toContain("Ask for a change");
  expect(html).not.toContain("Book a call");
});

it("offers the Book a call sheet, not a link to the booking page, when a booking page is set", () => {
  const html = render(data(), { bookingUrl: "https://cal.com/brandbasket/call" });
  expect(html).toContain(">Book a call</button>");
  expect(html).not.toContain('href="https://cal.com/brandbasket/call"');
  expect(html).not.toContain('target="_blank"');
});

it("shows the next call beside the next payment, and nothing when none is booked", () => {
  const html = render(data({ nextCall: "Wed 2 Dec, 14:00" }));
  expect(html).toContain("Next call");
  expect(html).toContain("Wed 2 Dec, 14:00");
  expect(render(data())).not.toContain("Next call");
});

it("lists at most 4 open items, with See all N to the To do page when there are more", () => {
  const items = [1, 2, 3, 4, 5, 6].map((n) => item(n));
  const html = render(data({ todo: [...items, item(7, { done: true })] }));
  expect(html).toContain("Needs you");
  expect(html).toContain("Thing 4");
  expect(html).not.toContain("Thing 5");
  expect(html).not.toContain("Thing 7");
  expect(html).toContain("See all 6");
  expect(html).toContain('href="/todo"');
});

it("shows no See all link when everything open fits", () => {
  const html = render(data({ todo: [item(1), item(2)] }));
  expect(html).not.toContain("See all");
});

it("opens the top item on its page with the dark button and the others with soft buttons, form items on the To do page", () => {
  const html = render(data({ todo: [item(1), item(2, { kind: "form", setup: "accounts" } as Partial<TodoItem>)] }));
  expect(html).toContain('href="/onboarding/step-1"');
  expect(html).toContain('href="/todo?focus=item-2#item-2"');
  expect(html.split(DARK_BUTTON).length - 1).toBe(1);
  expect(html.indexOf(DARK_BUTTON)).toBeLessThan(html.indexOf("/todo?focus=item-2#item-2"));
});

it("with nothing open replaces the heading with a quiet line and shows no dark button", () => {
  const html = render(data({ todo: [item(1, { done: true })] }));
  expect(html).toContain("Nothing needs you right now.");
  expect(html).not.toContain("Needs you");
  expect(html).not.toContain(DARK_BUTTON);
  expect(html).toContain("Everything is running. Nothing needs you.");
});

it("shows only the result lines given, each with its figure, headline and detail", () => {
  const html = render(
    data({
      results: [
        { service: "social", figure: "21", headline: "enquiries came from your ads", detail: "12 posts published" },
        { service: "search", figure: "9", headline: "searches show you on Google's first page", detail: null },
      ],
    }),
  );
  expect(html).toContain("November for Sai Dental Care");
  expect(html).toContain("21");
  expect(html).toContain("enquiries came from your ads");
  expect(html).toContain("12 posts published");
  expect(html).toContain("9");
  expect(html).toContain("searches show you on Google&#x27;s first page");
  expect(html).not.toContain("will appear here once we have them");
});

it("with no result lines says when the numbers will appear", () => {
  expect(render(data())).toContain("Numbers for November will appear here once we have them.");
});

it("lists What we did with day and month dates and labels", () => {
  const html = render(
    data({
      activity: [
        { key: "a", at: new Date("2026-10-27T06:00:00.000Z"), label: "New Sunday hours are live", service: "website" },
        { key: "b", at: new Date("2026-10-26T06:00:00.000Z"), label: "Ads narrowed to 4 km", service: "social" },
      ],
    }),
  );
  expect(html).toContain("What we did");
  expect(html).toContain("27 Oct");
  expect(html).toContain("New Sunday hours are live");
  expect(html).toContain("26 Oct");
  expect(html).toContain("Ads narrowed to 4 km");
  expect(html).not.toContain("Updates will appear here as we work.");
});

it("with no activity says updates will appear", () => {
  expect(render(data())).toContain("Updates will appear here as we work.");
});

it("shows the next payment with its amount and date, and nothing when there is none", () => {
  const paying = render(data({ nextPayment: { date: new Date("2026-12-26T06:00:00.000Z"), amount: "₹30,398" } }));
  expect(paying).toContain("Next payment");
  expect(paying).toContain("₹30,398");
  expect(paying).toContain("26 Dec");
  expect(render(data())).not.toContain("Next payment");
});

it("shows the next payment date alone when the amount is unknown", () => {
  const html = render(data({ nextPayment: { date: new Date("2026-12-26T06:00:00.000Z"), amount: null } }));
  expect(html).toContain("26 Dec");
  expect(html).not.toContain("null");
});

it("puts the build card first in the left column when one is given", () => {
  const html = renderToStaticMarkup(
    createElement(MonthOverview, {
      firstName: "Priya",
      businessName: "Sai Dental Care",
      data: data({ todo: [item(1)] }),
      now: NOW,
      buildCard: createElement("div", { id: "build-card" }),
      bookingUrl: null,
      callOptions: [],
      canBook: true,
    }),
  );
  expect(html.indexOf("build-card")).toBeGreaterThan(-1);
  expect(html.indexOf("build-card")).toBeLessThan(html.indexOf("Needs you"));
});

it("uses no uppercase labels and exactly one dark button", () => {
  const html = render(data({ todo: [item(1), item(2), item(3)], results: [{ service: "website", figure: "3", headline: "people left details", detail: null }] }));
  expect(html).not.toMatch(/\buppercase\b/);
  expect(html.split(DARK_BUTTON).length - 1).toBe(1);
});

it("lists a quote to accept before the To do items, with its price, and gives it the dark button", () => {
  const html = render(
    data({
      todo: [item(1)],
      requests: [{ key: "request-t1", label: "Accept a quote: Add an Implants page", hint: "3 hours, ₹1,500", service: "website", href: "/requests?open=t1" }],
    }),
  );
  expect(html).toContain("Everything is running. 2 things need you.");
  expect(html.indexOf("Accept a quote: Add an Implants page")).toBeLessThan(html.indexOf("Thing 1"));
  expect(html).toContain("3 hours, ₹1,500");
  expect(html).toContain('href="/requests?open=t1"');
  expect(html.split(DARK_BUTTON).length - 1).toBe(1);
  expect(html.indexOf(DARK_BUTTON)).toBeLessThan(html.indexOf("Thing 1"));
});

it("gives a request about Billing no service tag", () => {
  const html = render(data({ requests: [{ key: "request-t2", label: "Check this change: GST number on my invoice", hint: "Ready to check", service: null, href: "/requests?open=t2" }] }));
  expect(html).toContain("Check this change: GST number on my invoice");
  expect(html).toContain("Ready to check");
  expect(html).not.toContain("Website</span>");
});

it("shows the included edits used beside the next payment, and leaves the line out when the plan has none", () => {
  const html = render(data({ included: { used: 1, allowed: 2 }, nextPayment: { date: new Date("2026-12-26T05:00:00.000Z"), amount: "₹30,398" } }));
  expect(html).toContain("Included edits this month");
  expect(html).toContain("1 of 2 used");
  expect(html).toContain("₹30,398 on 26 Dec");
  expect(render(data())).not.toContain("Included edits");
  expect(render(data({ included: { used: 0, allowed: 2 } }))).toContain("0 of 2 used");
});
