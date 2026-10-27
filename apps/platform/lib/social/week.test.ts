import { describe, expect, it } from "vitest";
import { approveAllLabel, dueDate, dueLabel, monthLine, needsOkBy, postPosition, splitPosts, statusWord, waitingHeadline, postWindow, weekBounds, type PostView } from "@/lib/social/week";

function post(id: string, dueOn: string, status: PostView["status"] = "planned"): PostView {
  return { id, title: `Post ${id}`, caption: null, dueOn, status, hasImage: false, linkUrl: null };
}

describe("dueDate and dueLabel", () => {
  it("is noon in India and reads as a short day", () => {
    expect(dueDate("2026-12-01").toISOString()).toBe("2026-12-01T06:30:00.000Z");
    expect(dueLabel("2026-12-01")).toBe("Tue 1 Dec");
  });
});

describe("waiting posts", () => {
  const waiting = (...days: string[]): PostView[] => days.map((day, index) => post(`w${index}`, day, "awaiting_approval"));

  it("picks the earliest due date from an unordered list", () => {
    expect(needsOkBy(waiting("2026-12-04", "2026-12-01", "2026-12-03"))).toBe("Tue 1 Dec");
    expect(needsOkBy([])).toBeNull();
  });

  it("writes the headline for none, one and many", () => {
    expect(waitingHeadline([])).toBe("No posts are waiting for you.");
    expect(waitingHeadline(waiting("2026-12-01"))).toBe("1 post needs your OK by Tue 1 Dec");
    expect(waitingHeadline(waiting("2026-12-04", "2026-12-01", "2026-12-02", "2026-12-03"))).toBe("4 posts need your OK by Tue 1 Dec");
  });

  it("labels the approve button", () => {
    expect(approveAllLabel(1)).toBe("Approve");
    expect(approveAllLabel(4)).toBe("Approve all 4");
  });
});

describe("weekBounds", () => {
  it("is Monday to Sunday around a Wednesday", () => {
    expect(weekBounds(new Date("2026-11-04T06:00:00.000Z"))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("counts Monday 00:30 India time as Monday, though it is still Sunday in UTC", () => {
    expect(weekBounds(new Date("2026-11-01T19:00:00.000Z"))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });

  it("counts Sunday 23:30 India time as the same week", () => {
    expect(weekBounds(new Date("2026-11-08T18:00:00.000Z"))).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
});

describe("splitPosts", () => {
  const now = new Date("2026-11-04T06:00:00.000Z");

  it("keeps a waiting post due next week in waiting but not in this week", () => {
    const next = post("next", "2026-11-10", "awaiting_approval");
    const { waiting, thisWeek } = splitPosts([next], now);
    expect(waiting).toEqual([next]);
    expect(thisWeek).toEqual([]);
  });

  it("lists this week's posts of any status, and waiting posts, each by due date", () => {
    const posts = [
      post("c", "2026-11-06", "published"),
      post("a", "2026-11-03", "awaiting_approval"),
      post("late", "2026-11-12", "awaiting_approval"),
      post("b", "2026-11-05", "planned"),
      post("old", "2026-10-30", "published"),
    ];
    const { waiting, thisWeek } = splitPosts(posts, now);
    expect(waiting.map((entry) => entry.id)).toEqual(["a", "late"]);
    expect(thisWeek.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

describe("statusWord and postPosition", () => {
  it("has a word for every status", () => {
    expect(statusWord("planned")).toBe("Planned");
    expect(statusWord("awaiting_approval")).toBe("Needs your OK");
    expect(statusWord("approved")).toBe("Approved");
    expect(statusWord("published")).toBe("Published");
  });

  it("counts from one", () => {
    expect(postPosition(0, 4)).toBe("1 of 4");
    expect(postPosition(3, 4)).toBe("4 of 4");
  });
});

describe("monthLine", () => {
  const now = new Date("2026-11-15T06:00:00.000Z");

  it("counts published posts of the month's posts only", () => {
    const posts = [
      post("a", "2026-11-02", "published"),
      post("b", "2026-11-20", "planned"),
      post("c", "2026-11-30", "approved"),
      post("d", "2026-10-31", "published"),
      post("e", "2026-12-01", "published"),
    ];
    expect(monthLine(posts, now)).toBe("November: 1 of 3 posts out.");
  });

  it("is null when the month has no posts", () => {
    expect(monthLine([post("d", "2026-10-31", "published")], now)).toBeNull();
    expect(monthLine([], now)).toBeNull();
  });
});

describe("postWindow", () => {
  it("runs from the first of the month to the month's last day", () => {
    expect(postWindow(new Date("2026-11-10T06:00:00.000Z"))).toEqual({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("runs to the end of the week when that week crosses into the next month", () => {
    expect(postWindow(new Date("2026-11-30T06:00:00.000Z"))).toEqual({ from: "2026-11-01", to: "2026-12-06" });
  });

  it("uses the India month, so 00:30 on the 1st is already the new month", () => {
    expect(postWindow(new Date("2026-11-30T19:00:00.000Z"))).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});
