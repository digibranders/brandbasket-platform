import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/(protected)/calls/kickoff-actions", () => ({
  completeKickoffAction: vi.fn(),
  theyDidNotJoinAction: vi.fn(),
  rescheduleKickoffAction: vi.fn(),
}));

import { TodayKickoffPrompt } from "./kickoff-prompt";

const CALLS = [
  {
    businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c",
    businessName: "Green Leaf Cafe",
    endsAt: new Date("2026-11-14T09:30:00Z"),
  },
];

describe("TodayKickoffPrompt", () => {
  it("renders the prompt card with the question and three actions", () => {
    const html = renderToStaticMarkup(createElement(TodayKickoffPrompt, { kickoffs: CALLS }));
    expect(html).toContain("Did the kickoff call with Green Leaf Cafe happen?");
    expect(html).toContain("Call completed");
    expect(html).toContain("They did not join");
    expect(html).toContain("Reschedule");
    expect(html).toContain("What was agreed (optional)");
    expect(html).toContain("Call confirmation readies the website build. If not confirmed within 24 hours of scheduled completion, the build starts automatically.");
    expect(html).not.toContain("held");
  });

  it("renders nothing when no calls are pending", () => {
    const html = renderToStaticMarkup(createElement(TodayKickoffPrompt, { kickoffs: [] }));
    expect(html).toBe("");
  });
});
