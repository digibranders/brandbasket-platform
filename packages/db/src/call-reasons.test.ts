import { describe, expect, it } from "vitest";
import { CHANGE_KINDS } from "./change-states";
import { CALL_REASONS, CALL_SOURCES, CALL_STATUSES, MAX_CALL_NOTE_LENGTH, MAX_CALL_SUMMARY_LENGTH, MIN_CALL_SUMMARY_LENGTH, isCallReason } from "./call-reasons";

describe("call reasons", () => {
  it("are the five things a customer can ask about, the same list as a change request's kinds", () => {
    expect([...CALL_REASONS]).toEqual([...CHANGE_KINDS]);
  });

  it("recognise a reason and nothing else", () => {
    expect(isCallReason("billing")).toBe(true);
    expect(isCallReason("other")).toBe(true);
    expect(isCallReason("kickoff")).toBe(false);
    expect(isCallReason("")).toBe(false);
    expect(isCallReason(undefined)).toBe(false);
    expect(isCallReason(3)).toBe(false);
  });
});

describe("call statuses, sources and limits", () => {
  it("name the three states of a call and the two ways it is booked", () => {
    expect([...CALL_STATUSES]).toEqual(["booked", "held", "cancelled"]);
    expect([...CALL_SOURCES]).toEqual(["dashboard", "booking_page"]);
  });

  it("keep the note and the summary short enough to read at a glance", () => {
    expect(MAX_CALL_NOTE_LENGTH).toBe(500);
    expect(MIN_CALL_SUMMARY_LENGTH).toBe(3);
    expect(MAX_CALL_SUMMARY_LENGTH).toBe(600);
  });
});
