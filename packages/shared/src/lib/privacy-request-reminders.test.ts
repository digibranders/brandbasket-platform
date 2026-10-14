import { describe, expect, it } from "vitest";
import { reminderStageOf, selectReminders, type ReminderCandidate } from "./privacy-request-reminders";

const RECEIVED = new Date("2026-11-01T06:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number): Date => new Date(RECEIVED.getTime() + days * DAY);

function request(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return { id: "r1", receivedAt: RECEIVED, dueAt: at(30), closedAt: null, reminderStage: 0, ...overrides };
}

describe("reminderStageOf", () => {
  it("is 0 until day 20, 1 from day 20, 2 from day 25 and 3 once past the due date", () => {
    expect(reminderStageOf(request(), at(19.9))).toBe(0);
    expect(reminderStageOf(request(), at(20))).toBe(1);
    expect(reminderStageOf(request(), at(25))).toBe(2);
    expect(reminderStageOf(request(), at(30.1))).toBe(3);
  });

  it("is 0 for a closed request, however late", () => {
    expect(reminderStageOf(request({ closedAt: at(40) }), at(60))).toBe(0);
  });
});

describe("selectReminders", () => {
  it("lists a request the first night it reaches a stage it has not been reminded of", () => {
    expect(selectReminders([request()], at(20.2)).map((due) => due.stage)).toEqual([1]);
    expect(selectReminders([request({ reminderStage: 1 })], at(20.5))).toEqual([]);
    expect(selectReminders([request({ reminderStage: 1 })], at(25.2)).map((due) => due.stage)).toEqual([2]);
  });

  it("lists a request that jumped past a stage only once, at the stage it is at now", () => {
    expect(selectReminders([request({ reminderStage: 0 })], at(26)).map((due) => due.stage)).toEqual([2]);
  });

  it("lists an overdue request every night, and never a closed or on-track one", () => {
    expect(selectReminders([request({ reminderStage: 3 })], at(33)).map((due) => due.stage)).toEqual([3]);
    expect(selectReminders([request({ closedAt: at(31) })], at(33))).toEqual([]);
    expect(selectReminders([request()], at(5))).toEqual([]);
  });

  it("puts the soonest due first", () => {
    const later = request({ id: "later", receivedAt: at(2), dueAt: at(32) });
    const sooner = request({ id: "sooner" });
    expect(selectReminders([later, sooner], at(27)).map((due) => due.request.id)).toEqual(["sooner", "later"]);
  });
});
