import { describe, expect, it } from "vitest";
import { carouselSlideUrl, readCarousel, readCarousels } from "./carousel";

describe("readCarousels", () => {
  it("reads the list newest first, with the day cut to a date", () => {
    expect(readCarousels({ carousels: [{ id: "c2", topic: "Diwali boxes", date: "2026-11-18T10:00:00+05:30", count: 4, status: "pending" }, { id: "c1", date: "2026-11-11", count: 3, status: "approved" }] })).toEqual([
      { id: "c2", topic: "Diwali boxes", date: "2026-11-18", count: 4, status: "pending" },
      { id: "c1", topic: null, date: "2026-11-11", count: 3, status: "approved" },
    ]);
  });

  it("leaves out an entry it cannot read, and is empty for an answer that is not a list", () => {
    expect(readCarousels({ carousels: [{ id: "c1", count: 3, status: "mystery" }, { count: 3, status: "pending" }] })).toEqual([]);
    expect(readCarousels({})).toEqual([]);
    expect(readCarousels(null)).toEqual([]);
  });
});

describe("readCarousel", () => {
  it("reads the slides in order and the words for each channel it knows", () => {
    const read = readCarousel({
      carousel: {
        id: "c1",
        count: 3,
        status: "pending",
        slides: [{ position: 3, status: "pending" }, { position: 1, status: "pending" }, { position: 2, status: "pending" }],
        captions: [{ network: "instagram", caption: "Fresh sweets", status: "pending" }, { network: "tiktok", caption: "ignored", status: "pending" }],
      },
      reasons: ["weak_copy", "other", 7],
    });
    expect(read?.slides.map((slide) => slide.position)).toEqual([1, 2, 3]);
    expect(read?.captions).toEqual([{ network: "instagram", caption: "Fresh sweets", status: "pending" }]);
    expect(read?.reasons).toEqual(["weak_copy", "other"]);
  });

  it("is null for an answer that is not a carousel", () => {
    expect(readCarousel({ carousel: { id: "c1" } })).toBeNull();
    expect(readCarousel(undefined)).toBeNull();
  });
});

describe("carouselSlideUrl", () => {
  it("asks our own route, never the posting service directly", () => {
    expect(carouselSlideUrl("c 1", 2)).toBe("/api/social-carousels/slide?id=c+1&slide=2");
  });
});
