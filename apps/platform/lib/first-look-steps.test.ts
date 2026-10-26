import { describe, expect, it } from "vitest";
import { firstLookSteps } from "@/lib/first-look-steps";

describe("firstLookSteps", () => {
  it("before booking: the call is now, and nothing has a date yet", () => {
    const rows = firstLookSteps({ hasWebsite: true, callStartIso: null, booked: false });
    expect(rows.map((row) => [row.title, row.state, row.when])).toEqual([
      ["Kickoff call", "now", ""],
      ["We start building", "later", ""],
      ["You check the preview", "later", ""],
      ["Your website is live", "later", ""],
    ]);
  });

  it("after booking: the call is done and the dates follow it", () => {
    const rows = firstLookSteps({ hasWebsite: true, callStartIso: "2026-10-27T08:30:00.000Z", booked: true });
    expect(rows.map((row) => [row.title, row.state, row.when])).toEqual([
      ["Kickoff call booked", "done", "Tue 27 Oct"],
      ["We start building", "later", "By Thu 29 Oct"],
      ["You check the preview", "later", ""],
      ["Your website is live", "later", "By Thu 5 Nov"],
    ]);
  });

  it("without the website: only the call and the start", () => {
    expect(firstLookSteps({ hasWebsite: false, callStartIso: null, booked: false }).map((row) => row.title)).toEqual(["Kickoff call", "We start work"]);
  });
});
