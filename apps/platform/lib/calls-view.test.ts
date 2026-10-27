import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { CallsView } from "@/components/calls/calls-view";
import type { CallRow } from "@/lib/calls/rows";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/requests/calls/actions", () => ({ bookCallAction: vi.fn(), cancelCallAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-call-actions", () => ({ loadCallSlots: vi.fn() }));

const OPTIONS = [
  { value: "website", label: "Website" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Something else" },
] as const;

function row(overrides: Partial<CallRow>): CallRow {
  return {
    key: "call-1",
    callId: "call-1",
    about: "Billing",
    reason: "billing",
    note: "About my invoice",
    when: "Wed 2 Dec, 14:00",
    startsAtIso: "2026-12-02T08:30:00.000Z",
    endsAtIso: "2026-12-02T09:00:00.000Z",
    agreed: null,
    canChange: true,
    canCancel: true,
    ...overrides,
  };
}

function render(extra: Partial<Parameters<typeof CallsView>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(CallsView, { upcoming: [], past: [], options: OPTIONS, bookingUrl: null, canBook: true, ...extra }),
  ).replaceAll("<!-- -->", "");
}

it("heads the page Calls with a Book a call button, and says there are none yet", () => {
  const html = render();
  expect(html).toContain("<h1");
  expect(html).toContain(">Calls<");
  expect(html).toContain("What we agreed on each call.");
  expect(html).toContain(">Book a call<");
  expect(html).toContain(">No calls yet</h2>");
  expect(html).toContain("Book one when you want to talk something through, and what we agree is written here afterwards.");
  expect(html.match(/>Book a call</g)).toHaveLength(2);
  expect(html).not.toContain("Coming up");
  expect(html).not.toContain("Past calls");
});

it("lists a call still to come with its time, what it is about, Add to calendar, Change and Cancel call", () => {
  const html = render({ upcoming: [row({})] });
  expect(html).toContain("Coming up");
  expect(html).toContain("Wed 2 Dec, 14:00");
  expect(html).toContain(">Billing<");
  expect(html).toContain("Add to calendar");
  expect(html).toContain('download="brandbasket-call.ics"');
  expect(decodeURIComponent(/href="(data:text\/calendar[^"]+)"/.exec(html)?.[1] ?? "")).toContain("SUMMARY:Brandbasket call");
  expect(html).toContain(">Change<");
  expect(html).toContain(">Cancel call<");
  expect(html).not.toContain("No calls yet");
});

it("offers the calendar file and nothing else for the kickoff call, which is changed from Overview", () => {
  const html = render({ upcoming: [row({ key: "kickoff", callId: null, about: "Kickoff", reason: null, note: null, canChange: false, canCancel: false })] });
  expect(html).toContain("Add to calendar");
  const invite = /href="(data:text\/calendar[^"]+)"/.exec(html)?.[1] ?? "";
  expect(decodeURIComponent(invite)).toContain("SUMMARY:Brandbasket kickoff call");
  expect(html).not.toContain(">Change<");
  expect(html).not.toContain(">Cancel call<");
});

it("lists past calls with what was agreed, or says it will be added", () => {
  const html = render({
    past: [
      row({ key: "a", callId: "a", about: "Website", when: "Tue 3 Nov, 16:30", agreed: "Brighter photos, add Saturday timings, go live on the 5th", canChange: false, canCancel: false }),
      row({ key: "kickoff", callId: null, about: "Kickoff", when: "Tue 27 Oct, 14:00", canChange: false, canCancel: false }),
    ],
  });
  expect(html).toContain("Past calls");
  expect(html).toContain("Brighter photos, add Saturday timings, go live on the 5th");
  expect(html).toContain("We will add what we agreed here.");
  expect(html).not.toContain(">Cancel call<");
});
