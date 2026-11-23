import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ClientException } from "@/lib/client-exceptions";
import { ExceptionsStrip, OverviewNextStepCard } from "./client-overview-cards";

vi.mock("server-only", () => ({}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const KICKOFF: ClientException = {
  key: "kickoff",
  text: "The kickoff call ended 1d ago and nobody confirmed it",
  clock: "1d late",
  late: true,
  title: "Did the kickoff call with Harbour Bakery happen?",
  detail: "The 48 hour first preview clock starts when you confirm.",
  tab: "website",
  anchor: null,
};
const PROMPT = { businessName: "Harbour Bakery", endsAt: new Date("2026-11-02T10:30:00Z") };

describe("the kickoff exception on the Overview", () => {
  it("opens the kickoff prompt from the strip and the card instead of linking to the Website tab", () => {
    const strip = renderToStaticMarkup(createElement(ExceptionsStrip, { businessId: BUSINESS, exceptions: [KICKOFF], unreadable: [], kickoffPrompt: PROMPT }));
    const card = renderToStaticMarkup(createElement(OverviewNextStepCard, { businessId: BUSINESS, card: { kind: "exception", exception: KICKOFF }, kickoffPrompt: PROMPT }));
    for (const html of [strip, card]) {
      expect(html).toContain(">Call completed</button>");
      expect(html).not.toContain(`/clients/${BUSINESS}/website`);
    }
  });

  it("still links to the Website tab when the booked call is not known", () => {
    const strip = renderToStaticMarkup(createElement(ExceptionsStrip, { businessId: BUSINESS, exceptions: [KICKOFF], unreadable: [] }));
    expect(strip).toContain(`/clients/${BUSINESS}/website`);
    expect(strip).not.toContain("Call completed");
  });
});
