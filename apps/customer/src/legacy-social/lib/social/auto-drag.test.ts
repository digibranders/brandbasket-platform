import { describe, expect, it } from "vitest";
import { canChange, canDrag, type CalendarPost } from "./auto";

const post = (extra: Partial<CalendarPost>): CalendarPost =>
  ({ id: "p1", day: "2026-11-16", time: "10:00", caption: "Words", state: "scheduled", channels: [{ id: "instagram:1", platform: "instagram", account: "acme", state: "scheduled", permalink: null }], manual: false, ...extra }) as unknown as CalendarPost;

describe("which posts can be dragged on the calendar", () => {
  it("lets a post she made be dragged while it can still be changed", () => {
    expect(canDrag(post({ manual: true }))).toBe(true);
    expect(canDrag(post({ manual: true, state: "published" }))).toBe(false);
  });

  it("lets a post we wrote for her be dragged while it is scheduled, but not once it has gone out or is held", () => {
    expect(canDrag(post({}))).toBe(true);
    expect(canDrag(post({ state: "held" }))).toBe(false);
    expect(canDrag(post({ state: "published" }))).toBe(false);
  });

  it("still leaves editing the words to the posts she made", () => {
    expect(canChange(post({}))).toBe(false);
    expect(canChange(post({ manual: true }))).toBe(true);
  });
});
