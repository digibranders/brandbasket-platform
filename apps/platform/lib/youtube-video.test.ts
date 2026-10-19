import { describe, expect, it } from "vitest";
import { parseYoutubeLink, youtubeThumbnailUrl, youtubeWatchUrl } from "./youtube-video";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeLink", () => {
  it("reads the video id from every form YouTube shares", () => {
    for (const typed of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s`,
      `https://m.youtube.com/watch?feature=share&v=${ID}`,
      `https://youtu.be/${ID}`,
      `youtu.be/${ID}?si=abc`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `http://www.youtube.com/watch?v=${ID}`,
    ]) {
      expect(parseYoutubeLink(typed)).toEqual({ ok: true, videoId: ID });
    }
  });

  it("refuses links that are not one YouTube video", () => {
    for (const typed of [
      "",
      "https://www.youtube.com/@brandbasket",
      "https://www.youtube.com/watch?v=short",
      "https://vimeo.com/123456",
      `https://youtube.com.evil.example/watch?v=${ID}`,
      `javascript:alert('${ID}')`,
    ]) {
      expect(parseYoutubeLink(typed)).toMatchObject({ ok: false });
    }
  });
});

describe("youtube addresses", () => {
  it("builds the watch page and thumbnail from the id", () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
