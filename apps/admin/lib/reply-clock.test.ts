import { describe, expect, it } from "vitest";
import { replyClock, replyClockFromMessages, waitingLabel } from "./reply-clock";

const at = (iso: string): Date => new Date(iso);

describe("replyClock", () => {
  it("needs a reply when the client wrote after the last staff reply", () => {
    expect(replyClock({ status: "triaged", lastCustomerMessageAt: at("2026-11-29T08:00:00Z"), lastStaffReplyAt: at("2026-11-29T07:00:00Z") })).toEqual({
      queue: "needs_reply",
      waitingSince: at("2026-11-29T08:00:00Z"),
    });
  });

  it("needs a reply when staff have not replied at all", () => {
    expect(replyClock({ status: "new", lastCustomerMessageAt: at("2026-11-29T08:00:00Z"), lastStaffReplyAt: null }).queue).toBe("needs_reply");
  });

  it("waits on the client when staff replied last, or at the same moment", () => {
    expect(replyClock({ status: "in_progress", lastCustomerMessageAt: at("2026-11-29T08:00:00Z"), lastStaffReplyAt: at("2026-11-29T09:00:00Z") })).toEqual({
      queue: "waiting_on_client",
      waitingSince: null,
    });
    expect(replyClock({ status: "in_progress", lastCustomerMessageAt: at("2026-11-29T08:00:00Z"), lastStaffReplyAt: at("2026-11-29T08:00:00Z") }).queue).toBe("waiting_on_client");
  });

  it("waits on the client when staff opened it and the client has not written", () => {
    expect(replyClock({ status: "new", lastCustomerMessageAt: null, lastStaffReplyAt: at("2026-11-29T08:00:00Z") }).queue).toBe("waiting_on_client");
  });

  it("is done when resolved or closed, whoever wrote last", () => {
    for (const status of ["resolved", "closed"] as const) {
      expect(replyClock({ status, lastCustomerMessageAt: at("2026-11-29T08:00:00Z"), lastStaffReplyAt: null })).toEqual({ queue: "done", waitingSince: null });
    }
  });
});

describe("replyClockFromMessages", () => {
  it("ignores internal staff notes, which are not replies", () => {
    const messages = [
      { authorRole: "customer", visibility: "public", createdAt: at("2026-11-29T08:00:00Z") },
      { authorRole: "staff", visibility: "internal", createdAt: at("2026-11-29T09:00:00Z") },
    ] as const;
    expect(replyClockFromMessages("triaged", messages)).toEqual({ queue: "needs_reply", waitingSince: at("2026-11-29T08:00:00Z") });
  });

  it("uses the newest public message on each side", () => {
    const messages = [
      { authorRole: "customer", visibility: "public", createdAt: at("2026-11-29T08:00:00Z") },
      { authorRole: "staff", visibility: "public", createdAt: at("2026-11-29T09:00:00Z") },
      { authorRole: "customer", visibility: "public", createdAt: at("2026-11-29T10:00:00Z") },
    ] as const;
    expect(replyClockFromMessages("in_progress", messages).waitingSince).toEqual(at("2026-11-29T10:00:00Z"));
  });
});

describe("waitingLabel", () => {
  const now = at("2026-11-30T12:00:00Z");

  it("writes minutes under an hour, hours under two days, then days", () => {
    expect(waitingLabel(at("2026-11-30T11:15:00Z"), now).text).toBe("45m");
    expect(waitingLabel(at("2026-11-29T10:00:00Z"), now).text).toBe("26h");
    expect(waitingLabel(at("2026-11-27T12:00:00Z"), now).text).toBe("3d");
  });

  it("is late after a day and soon after four hours", () => {
    expect(waitingLabel(at("2026-11-30T10:00:00Z"), now).tone).toBe("ok");
    expect(waitingLabel(at("2026-11-30T06:00:00Z"), now).tone).toBe("soon");
    expect(waitingLabel(at("2026-11-29T10:00:00Z"), now).tone).toBe("late");
  });

  it("never counts backwards", () => {
    expect(waitingLabel(at("2026-11-30T13:00:00Z"), now)).toEqual({ text: "0m", tone: "ok" });
  });
});
