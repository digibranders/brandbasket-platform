import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(protected)/calls/kickoff-actions", () => ({
  completeKickoffAction: vi.fn(),
  theyDidNotJoinAction: vi.fn(),
  rescheduleKickoffAction: vi.fn(),
  markKickoffPromptsShownAction: vi.fn(),
}));

import { KICKOFF_AUTO_START_NOTE } from "@/lib/kickoff-copy";
import { KickoffPromptPopup, type KickoffPromptPopupItem } from "./kickoff-prompt-popup";

const prompt = (callId: string, businessName: string, due: boolean): KickoffPromptPopupItem => ({
  callId,
  businessId: `01a0f71b-8402-7d48-a90a-207e8c8a88${callId}`,
  businessName,
  endsAt: new Date("2026-11-14T09:30:00Z"),
  due,
});

const render = (prompts: readonly KickoffPromptPopupItem[]): string => renderToStaticMarkup(createElement(KickoffPromptPopup, { prompts }));

describe("KickoffPromptPopup", () => {
  it("opens the dialog for a due call, with the question and the three actions", () => {
    const html = render([prompt("2c", "Green Leaf Cafe", true)]);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Did the kickoff call with Green Leaf Cafe happen?");
    expect(html).toContain("Call completed");
    expect(html).toContain("They did not join");
    expect(html).toContain("Reschedule");
    expect(html).toContain("What was agreed (optional)");
    expect(html).toContain(KICKOFF_AUTO_START_NOTE);
    expect(html).not.toContain("held");
  });

  it("shows every pending call, not only the first", () => {
    const html = render([prompt("2c", "Green Leaf Cafe", true), prompt("2d", "Kestrel Bakery", false)]);
    expect(html).toContain("Did the kickoff call with Green Leaf Cafe happen?");
    expect(html).toContain("Did the kickoff call with Kestrel Bakery happen?");
  });

  it("stays a small notice, not a dialog, while no call is due", () => {
    const html = render([prompt("2c", "Green Leaf Cafe", false)]);
    expect(html).not.toContain('role="dialog"');
    expect(html).toContain("Kickoff call waiting");
    expect(html).toContain("Answer");
  });

  it("counts the calls in the notice when several wait", () => {
    expect(render([prompt("2c", "A", false), prompt("2d", "B", false)])).toContain("2 kickoff calls are waiting for your answer");
  });

  it("renders nothing when there are no pending kickoffs", () => {
    expect(render([])).toBe("");
  });
});
