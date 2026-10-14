import { describe, expect, it } from "vitest";
import {
  VIDEO_MAX_SECONDS,
  VIDEO_MAX_UPLOAD_BYTES,
  VIDEO_SECONDS_TOLERANCE,
  VIDEO_SLOTS,
  isVideoLengthAllowed,
  parseVideoSlot,
  videoTooLongMessage,
  vimeoEmbedUrl,
} from "./videos";

describe("parseVideoSlot", () => {
  it("accepts the three slots as numbers or digits", () => {
    expect(parseVideoSlot(1)).toBe(1);
    expect(parseVideoSlot("2")).toBe(2);
    expect(parseVideoSlot("3")).toBe(3);
  });

  it.each([0, 4, 2.5, "0", "4", "x", "", " 2", "2 ", null, undefined, {}])("refuses %j", (value) => {
    expect(parseVideoSlot(value)).toBeNull();
  });

  it("lists every slot once, in order", () => {
    expect(VIDEO_SLOTS).toEqual([1, 2, 3]);
  });
});

describe("isVideoLengthAllowed", () => {
  it("allows the limit and a small margin over it", () => {
    expect(isVideoLengthAllowed(VIDEO_MAX_SECONDS)).toBe(true);
    expect(isVideoLengthAllowed(VIDEO_MAX_SECONDS + VIDEO_SECONDS_TOLERANCE)).toBe(true);
  });

  it("refuses anything longer, and anything that is not a positive length", () => {
    expect(isVideoLengthAllowed(VIDEO_MAX_SECONDS + VIDEO_SECONDS_TOLERANCE + 0.01)).toBe(false);
    expect(isVideoLengthAllowed(0)).toBe(false);
    expect(isVideoLengthAllowed(-3)).toBe(false);
    expect(isVideoLengthAllowed(Number.NaN)).toBe(false);
    expect(isVideoLengthAllowed(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("videoTooLongMessage", () => {
  it("names how long the video is and what the limit is", () => {
    expect(videoTooLongMessage(23.4)).toBe("That video is 23 seconds. The limit is 16 seconds.");
  });

  it("rounds a length just over the limit up to a whole second, so it never reads as within the limit", () => {
    expect(videoTooLongMessage(16.7)).toBe("That video is 17 seconds. The limit is 16 seconds.");
  });
});

describe("limits", () => {
  it("allows 50 MB as sent", () => {
    expect(VIDEO_MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
  });
});

describe("vimeoEmbedUrl", () => {
  it("is the address of the video in Vimeo's player, with its privacy hash and a quiet, tracking-free look", () => {
    const url = new URL(vimeoEmbedUrl("1233986429", "858a280296"));
    expect(url.origin).toBe("https://player.vimeo.com");
    expect(url.pathname).toBe("/video/1233986429");
    expect(Object.fromEntries(url.searchParams)).toEqual({ h: "858a280296", dnt: "1", title: "0", byline: "0", portrait: "0" });
  });

  it("refuses an id or hash that could change where the address points", () => {
    expect(() => vimeoEmbedUrl("12/../3", "858a280296")).toThrow("Vimeo video id");
    expect(() => vimeoEmbedUrl("1233986429", "abc&autoplay=1")).toThrow("Vimeo privacy hash");
    expect(() => vimeoEmbedUrl("", "858a280296")).toThrow("Vimeo video id");
  });
});
