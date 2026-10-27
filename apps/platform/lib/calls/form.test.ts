import { describe, expect, it } from "vitest";
import { readBookCall } from "./form";

const ALL = ["website", "social", "search", "billing", "other"] as const;

describe("readBookCall", () => {
  it("takes a reason the customer may pick and keeps the note trimmed", () => {
    expect(readBookCall({ reason: "social", note: "  I want to try ads for braces in January.  " }, ALL)).toEqual({
      ok: true,
      reason: "social",
      note: "I want to try ads for braces in January.",
    });
  });

  it("treats a missing or blank note as no note", () => {
    expect(readBookCall({ reason: "billing", note: undefined }, ALL)).toEqual({ ok: true, reason: "billing", note: null });
    expect(readBookCall({ reason: "billing", note: null }, ALL)).toEqual({ ok: true, reason: "billing", note: null });
    expect(readBookCall({ reason: "billing", note: "   " }, ALL)).toEqual({ ok: true, reason: "billing", note: null });
  });

  it("refuses a reason that is not on the list, or is a service the customer has not bought", () => {
    const refused = { ok: false, message: "Choose what the call is about." };
    expect(readBookCall({ reason: "kickoff", note: "" }, ALL)).toEqual(refused);
    expect(readBookCall({ reason: undefined, note: "" }, ALL)).toEqual(refused);
    expect(readBookCall({ reason: "search", note: "" }, ["website", "billing", "other"])).toEqual(refused);
  });

  it("refuses a note that is too long or is not text", () => {
    expect(readBookCall({ reason: "other", note: "x".repeat(501) }, ALL)).toEqual({ ok: false, message: "Keep the note to 500 characters or fewer." });
    expect(readBookCall({ reason: "other", note: "x".repeat(500) }, ALL)).toMatchObject({ ok: true });
    expect(readBookCall({ reason: "other", note: 42 }, ALL)).toEqual({ ok: false, message: "Keep the note to 500 characters or fewer." });
  });
});
