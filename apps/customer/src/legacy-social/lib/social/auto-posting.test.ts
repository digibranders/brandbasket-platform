import { describe, expect, it } from "vitest";
import { readAutoPosting, safetyWords } from "./auto-posting";

describe("automatic posting as the posting service holds it", () => {
  const connected = ["instagram", "facebook"] as const;

  it("reads the chosen channels, the wait, when she agreed, and the channels still to ask about", () => {
    const body = { workspace: { approvalMode: "auto", autoPosting: { channels: ["instagram"], safetyHours: 48, consentedAt: "2026-11-14T10:00:00Z", needsChoice: ["facebook"] } } };
    expect(readAutoPosting(body, connected)).toEqual({ channels: ["instagram"], safetyHours: 48, consentedAt: "2026-11-14T10:00:00Z", needsChoice: ["facebook"] });
  });

  it("reads a customer who has not chosen as nothing automatic, with every connected channel to ask about", () => {
    expect(readAutoPosting({ workspace: { autoPosting: null } }, connected)).toEqual({ channels: [], safetyHours: 24, consentedAt: null, needsChoice: ["instagram", "facebook"] });
  });

  it("is null for a posting service that has no automatic posting, so no choice is offered", () => {
    expect(readAutoPosting({ workspace: { channels: [] } }, connected)).toBeNull();
    expect(readAutoPosting(null, connected)).toBeNull();
    expect(readAutoPosting({}, connected)).toBeNull();
  });

  it("keeps only channels it knows and keeps the wait between 0 and 72 hours", () => {
    const body = { workspace: { autoPosting: { channels: ["tiktok", "facebook", "instagram"], safetyHours: 500, consentedAt: 5, needsChoice: "x" } } };
    expect(readAutoPosting(body, connected)).toEqual({ channels: ["instagram", "facebook"], safetyHours: 72, consentedAt: null, needsChoice: [] });
  });

  it("says the wait in words", () => {
    expect(safetyWords(24)).toBe("24 hours before they go out");
    expect(safetyWords(1)).toBe("1 hour before they go out");
    expect(safetyWords(0)).toBe("as soon as they pass our checks");
  });
});
