import { describe, expect, it } from "vitest";
import type { Poster } from "./ai";
import type { AutoPost } from "./auto";
import { withScheduledMoments } from "./scheduled-moments";

const poster = (over: Partial<Poster>): Poster => ({ id: "v1", postId: "w01-d1", date: "2026-11-30", time: "10:00", ...over }) as Poster;
const scheduled = (id: string, date: string): AutoPost => ({ id, date, caption: "c", manual: false, state: "scheduled", channels: [] }) as unknown as AutoPost;

describe("withScheduledMoments", () => {
  it("puts the day and time the calendar moved a post to on its picture", () => {
    const [moved] = withScheduledMoments([poster({})], [scheduled("brandbasket-abc-w01-d1", "2026-11-30T17:00:00+05:30")]);
    expect([moved?.date, moved?.time]).toEqual(["2026-11-30", "17:00"]);
  });

  it("moves to another day as well, and leaves a picture with no scheduled post as the plan said", () => {
    const list = withScheduledMoments([poster({}), poster({ id: "v2", postId: "w01-d2", date: "2026-12-01" })], [scheduled("brandbasket-abc-w01-d1", "2026-12-02T09:30:00+05:30")]);
    expect([list[0]?.date, list[0]?.time]).toEqual(["2026-12-02", "09:30"]);
    expect([list[1]?.date, list[1]?.time]).toEqual(["2026-12-01", "10:00"]);
  });

  it("changes nothing when there is no schedule", () => {
    const original = poster({});
    expect(withScheduledMoments([original], [])[0]).toBe(original);
  });
});
