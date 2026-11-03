import { describe, expect, it } from "vitest";
import { canAddOn, checkNewPost, checkPostEdit, isChangeablePostId, earliestDay, latestDay, looksLikeJpeg, MAX_CAPTION_LENGTH, pictureProblem } from "./new-post";

const TODAY = "2026-11-02";
const PICTURE = "a".repeat(32);
const CONNECTED = ["instagram:1", "facebook:2", "linkedin:3"];
const valid = { day: "2026-11-04", caption: "Fresh sourdough.", pictureId: PICTURE, channels: ["instagram:1", "linkedin:3"] };

describe("which days can take a post", () => {
  it("is from tomorrow, because today's run is at 10:00, to the 89th day from today", () => {
    expect(earliestDay(TODAY)).toBe("2026-11-03");
    expect(latestDay(TODAY)).toBe("2027-01-30");
    expect(canAddOn("2026-11-02", TODAY)).toBe(false);
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
    expect(checkNewPost({ ...valid, caption: "  Fresh sourdough.\r\nCome early.  ", channels: ["instagram:1", "instagram:1"] }, TODAY, CONNECTED)).toEqual({
      ok: true,
      post: { day: "2026-11-04", caption: "Fresh sourdough.\nCome early.", pictureId: PICTURE, channels: ["instagram:1"] },
    });
  });

  it.each([
    ["no day", { day: null }, "Choose a day."],
    ["a day that is not a day", { day: "next week" }, "Choose a day."],
    ["today", { day: TODAY }, "Posts go out at 10:00 AM."],
    ["a day too far ahead", { day: "2027-03-01" }, "Posts go out at 10:00 AM."],
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
    const result = checkNewPost({ ...valid, ...change }, TODAY, CONNECTED);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain(message);
  });

  it("counts a hashtag only at the start of a word", () => {
    expect(checkNewPost({ ...valid, caption: "Price #1 in town, call 555#1234" }, TODAY, CONNECTED).ok).toBe(true);
  });
});

describe("changes to a post", () => {
  const edit = { day: "2026-11-06", caption: "  New words  ", pictureId: "", channels: ["instagram:1"] };

  it("keeps the picture when none is sent, and takes a new one when it is", () => {
    expect(checkPostEdit(edit, TODAY, CONNECTED, "2026-11-04")).toEqual({ ok: true, edit: { day: "2026-11-06", caption: "New words", channels: ["instagram:1"] } });
    expect(checkPostEdit({ ...edit, pictureId: null }, TODAY, CONNECTED, "2026-11-04")).toMatchObject({ ok: true });
    expect(checkPostEdit({ ...edit, pictureId: PICTURE }, TODAY, CONNECTED, "2026-11-04")).toMatchObject({ ok: true, edit: { pictureId: PICTURE } });
    expect(checkPostEdit({ ...edit, pictureId: "nope" }, TODAY, CONNECTED, "2026-11-04")).toEqual({ ok: false, message: "Add the picture again." });
  });

  it("accepts the post's own day as it is, even when it is today, but no other day that has passed", () => {
    expect(checkPostEdit({ ...edit, day: TODAY }, TODAY, CONNECTED, TODAY)).toMatchObject({ ok: true, edit: { day: TODAY } });
    expect(checkPostEdit({ ...edit, day: "2026-11-01" }, TODAY, CONNECTED, TODAY)).toMatchObject({ ok: false });
    expect(checkPostEdit({ ...edit, day: "2027-02-01" }, TODAY, CONNECTED, "2026-11-04")).toMatchObject({ ok: false });
  });

  it("holds the words and the accounts to the new post's rules", () => {
    expect(checkPostEdit({ ...edit, caption: " " }, TODAY, CONNECTED, "2026-11-04")).toEqual({ ok: false, message: "Write what the post should say." });
    expect(checkPostEdit({ ...edit, channels: [] }, TODAY, CONNECTED, "2026-11-04")).toEqual({ ok: false, message: "Choose at least one account." });
    expect(checkPostEdit({ ...edit, channels: ["facebook:999"] }, TODAY, CONNECTED, "2026-11-04")).toMatchObject({ ok: false });
  });

  it("names only the posts a business made as changeable", () => {
    expect(isChangeablePostId("manual-0123456789ab")).toBe(true);
    expect(isChangeablePostId("2026-11-04-abc")).toBe(false);
    expect(isChangeablePostId("../manual-0123456789ab")).toBe(false);
    expect(isChangeablePostId(7)).toBe(false);
  });
});
