import { describe, expect, it } from "vitest";
import { readMailOutcome, readRequestActionNotice, requestActionLine } from "@/lib/request-notices";

describe("request notices", () => {
  it("reads the words it knows and nothing else", () => {
    expect(readRequestActionNotice("quoted")).toBe("quoted");
    expect(readRequestActionNotice("toString")).toBeNull();
    expect(readRequestActionNotice(["quoted"])).toBeNull();
    expect(readMailOutcome("no-email")).toBe("no-email");
    expect(readMailOutcome("sent")).toBeNull();
  });

  it("says whether the customer was told, and calls a failed email a problem", () => {
    expect(requestActionLine("quoted", "emailed")).toEqual({ ok: true, text: "Quote sent. The customer was emailed." });
    expect(requestActionLine("finished", "no-email")).toEqual({ ok: false, text: "Marked done. They have no email address, so tell them another way." });
    expect(requestActionLine("started", "failed").ok).toBe(false);
    expect(requestActionLine("quoted", null)).toEqual({ ok: true, text: "Quote sent." });
  });

  it("gives a refusal its own words, whatever the mail", () => {
    expect(requestActionLine("moved", "emailed")).toEqual({ ok: false, text: "This request has already moved on. Reload the page to see where it is." });
  });

  it("never uses a dash", () => {
    expect(JSON.stringify(requestActionLine("quoted", "failed"))).not.toMatch(/[–—]/);
  });
});
