import { describe, expect, it } from "vitest";
import { canAddOn, checkNewPost, checkPostEdit, earliestDay, isChangeablePostId, isTime, latestDay, looksLikeJpeg, MAX_CAPTION_LENGTH, momentHasPassed, pictureProblem } from "./new-post";

const TODAY = "2026-11-02";
const PICTURE = "a".repeat(32);
const CONNECTED = ["instagram:1", "facebook:2", "linkedin:3"];
const NOW = new Date("2026-11-02T05:00:00.000Z"); // 10:30 in India
const valid = { day: "2026-11-04", time: "14:30", caption: "Fresh sourdough.", pictureId: PICTURE, channels: ["instagram:1", "linkedin:3"] };

describe("which days can take a post", () => {
  it("is from today (the time chosen must still be ahead) to the 89th day from today", () => {
    expect(earliestDay(TODAY)).toBe("2026-11-02");
    expect(latestDay(TODAY)).toBe("2027-01-30");
    expect(canAddOn("2026-11-02", TODAY)).toBe(true);
    expect(canAddOn("2026-11-01", TODAY)).toBe(false);
    expect(canAddOn("2026-11-03", TODAY)).toBe(true);
    expect(canAddOn("2027-01-30", TODAY)).toBe(true);
    expect(canAddOn("2027-01-31", TODAY)).toBe(false);
  });
});

describe("a picture", () => {
  const ok = { type: "image/jpeg", bytes: 200_000, width: 1080, height: 1080 };

  it("passes when it is a square JPG of a good size", () => {
    expect(pictureProblem(ok)).toBeNull();
    expect(pictureProblem({ ...ok, width: 320, height: 320 })).toBeNull();
    expect(pictureProblem({ ...ok, width: 4096, height: 4096 })).toBeNull();
  });

  it("says plainly what is wrong with one that does not", () => {
    expect(pictureProblem({ ...ok, type: "image/png" })).toBe("The picture must be a JPG.");
    expect(pictureProblem({ ...ok, bytes: 4 * 1024 * 1024 + 1 })).toBe("The picture is over 4 MB. Choose a smaller one.");
    expect(pictureProblem({ ...ok, height: 800 })).toBe("The picture must be square, as wide as it is tall.");
    expect(pictureProblem({ ...ok, width: 300, height: 300 })).toContain("between 320 and 4096 pixels");
    expect(pictureProblem({ ...ok, width: 5000, height: 5000 })).toContain("between 320 and 4096 pixels");
  });

  it("is looked at by its first bytes on the server", () => {
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(looksLikeJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(looksLikeJpeg(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});

describe("checkNewPost", () => {
  it("accepts a post and tidies it: the caption trimmed, each account once", () => {
    expect(checkNewPost({ ...valid, caption: "  Fresh sourdough.\r\nCome early.  ", channels: ["instagram:1", "instagram:1"] }, TODAY, CONNECTED, NOW)).toEqual({
      ok: true,
      post: { day: "2026-11-04", time: "14:30", caption: "Fresh sourdough.\nCome early.", pictureId: PICTURE, channels: ["instagram:1"] },
    });
  });

  it.each([
    ["no day", { day: null }, "Choose a day."],
    ["a day that is not a day", { day: "next week" }, "Choose a day."],
    ["a day that has gone", { day: "2026-11-01" }, "Choose a day from 2026-11-02"],
    ["a day too far ahead", { day: "2027-03-01" }, "Choose a day from 2026-11-02"],
    ["no time", { time: undefined }, "Choose a time, like 14:30."],
    ["a time that is not a time", { time: "25:99" }, "Choose a time, like 14:30."],
    ["a time today that has passed", { day: TODAY, time: "09:00" }, "That time has already passed."],
    ["no words", { caption: "   " }, "Write what the post should say."],
    ["words that are not text", { caption: 5 }, "Write what the post should say."],
    ["a caption that is too long", { caption: "x".repeat(MAX_CAPTION_LENGTH + 1) }, "Instagram allows 2200."],
    ["too many hashtags", { caption: Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ") }, "Instagram allows 30."],
    ["no picture", { pictureId: undefined }, "Add a picture first."],
    ["a picture id that is not one", { pictureId: "../etc/passwd" }, "Add a picture first."],
    ["no accounts chosen", { channels: [] }, "Choose at least one account."],
    ["accounts that are not a list", { channels: "instagram:1" }, "Choose where to post."],
    ["an account that is not connected", { channels: ["instagram:1", "facebook:999"] }, "One of the accounts is not connected."],
  ])("refuses %s", (_name, change, message) => {
    const result = checkNewPost({ ...valid, ...change }, TODAY, CONNECTED, NOW);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain(message);
  });

  it("accepts today at a time still ahead", () => {
    expect(checkNewPost({ ...valid, day: TODAY, time: "11:00" }, TODAY, CONNECTED, NOW)).toMatchObject({ ok: true, post: { day: TODAY, time: "11:00" } });
  });

  it("counts a hashtag only at the start of a word", () => {
    expect(checkNewPost({ ...valid, caption: "Price #1 in town, call 555#1234" }, TODAY, CONNECTED, NOW).ok).toBe(true);
  });
});

describe("changes to a post", () => {
  const edit = { day: "2026-11-06", time: "09:15", caption: "  New words  ", pictureId: "", channels: ["instagram:1"] };
  const own = { day: "2026-11-04", time: "10:00" };

  it("keeps the picture when none is sent, and takes a new one when it is", () => {
    expect(checkPostEdit(edit, TODAY, CONNECTED, own, NOW)).toEqual({ ok: true, edit: { day: "2026-11-06", time: "09:15", caption: "New words", channels: ["instagram:1"] } });
    expect(checkPostEdit({ ...edit, pictureId: null }, TODAY, CONNECTED, own, NOW)).toMatchObject({ ok: true });
    expect(checkPostEdit({ ...edit, pictureId: PICTURE }, TODAY, CONNECTED, own, NOW)).toMatchObject({ ok: true, edit: { pictureId: PICTURE } });
    expect(checkPostEdit({ ...edit, pictureId: "nope" }, TODAY, CONNECTED, own, NOW)).toEqual({ ok: false, message: "Add the picture again." });
  });

  it("accepts the post's own day and time as they are, even when they are today's and gone, but no other that has passed", () => {
    const today = { day: TODAY, time: "09:00" };
    expect(checkPostEdit({ ...edit, day: TODAY, time: "09:00" }, TODAY, CONNECTED, today, NOW)).toMatchObject({ ok: true, edit: { day: TODAY, time: "09:00" } });
    expect(checkPostEdit({ ...edit, day: TODAY, time: "09:30" }, TODAY, CONNECTED, today, NOW)).toMatchObject({ ok: false });
    expect(checkPostEdit({ ...edit, day: "2026-11-01" }, TODAY, CONNECTED, today, NOW)).toMatchObject({ ok: false });
    expect(checkPostEdit({ ...edit, day: "2027-02-01" }, TODAY, CONNECTED, own, NOW)).toMatchObject({ ok: false });
  });

  it("holds the words and the accounts to the new post's rules", () => {
    expect(checkPostEdit({ ...edit, caption: " " }, TODAY, CONNECTED, own, NOW)).toEqual({ ok: false, message: "Write what the post should say." });
    expect(checkPostEdit({ ...edit, channels: [] }, TODAY, CONNECTED, own, NOW)).toEqual({ ok: false, message: "Choose at least one account." });
    expect(checkPostEdit({ ...edit, channels: ["facebook:999"] }, TODAY, CONNECTED, own, NOW)).toMatchObject({ ok: false });
  });

  it("names only the posts a business made as changeable", () => {
    expect(isChangeablePostId("manual-0123456789ab")).toBe(true);
    expect(isChangeablePostId("2026-11-04-abc")).toBe(false);
    expect(isChangeablePostId("../manual-0123456789ab")).toBe(false);
    expect(isChangeablePostId(7)).toBe(false);
  });
});

describe("times", () => {
  it("reads only 24 hour times like 14:30", () => {
    expect(isTime("00:00")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("9:30")).toBe(false);
    expect(isTime(1430)).toBe(false);
  });

  it("says a moment has passed by India time", () => {
    expect(momentHasPassed("2026-11-02", "10:29", NOW)).toBe(true);
    expect(momentHasPassed("2026-11-02", "10:31", NOW)).toBe(false);
    expect(momentHasPassed("2026-11-03", "00:00", NOW)).toBe(false);
  });
});
