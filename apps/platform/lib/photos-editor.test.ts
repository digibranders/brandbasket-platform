import { describe, expect, it } from "vitest";
import {
  freeGallerySlots,
  galleryNeighbour,
  galleryRoom,
  notAnImageMessage,
  photosStatus,
  readableSize,
  savingLine,
  tooManyMessage,
  tooSmallMessage,
  type GalleryEntry,
} from "./photos-editor";

const gallery = (ids: readonly (string | null)[]): readonly GalleryEntry[] =>
  (["gallery_1", "gallery_2", "gallery_3", "gallery_4", "gallery_5", "gallery_6"] as const).map((slot, index) => ({ slot, pictureId: ids[index] ?? null }));

describe("freeGallerySlots", () => {
  it("lists the empty places in order, including ones left by a removed photo", () => {
    expect(freeGallerySlots(gallery(["a", null, "c"]))).toEqual(["gallery_2", "gallery_4", "gallery_5", "gallery_6"]);
  });

  it("is empty when the gallery is full", () => {
    expect(freeGallerySlots(gallery(["a", "b", "c", "d", "e", "f"]))).toEqual([]);
  });
});

describe("galleryNeighbour", () => {
  it("steps over the empty places a removed photo left", () => {
    const places = gallery(["a", null, "c", "d"]);
    expect(galleryNeighbour(places, "gallery_3", -1)?.slot).toBe("gallery_1");
    expect(galleryNeighbour(places, "gallery_1", 1)?.slot).toBe("gallery_3");
    expect(galleryNeighbour(places, "gallery_3", 1)?.slot).toBe("gallery_4");
  });

  it("has none past either end, or for a place with no photo", () => {
    const places = gallery(["a", "b"]);
    expect(galleryNeighbour(places, "gallery_1", -1)).toBeNull();
    expect(galleryNeighbour(places, "gallery_2", 1)).toBeNull();
    expect(galleryNeighbour(places, "gallery_5", -1)).toBeNull();
  });
});

describe("galleryRoom", () => {
  it("takes what fits and counts the rest", () => {
    expect(galleryRoom(2, 5)).toEqual({ take: 2, leftOver: 3 });
    expect(galleryRoom(6, 4)).toEqual({ take: 4, leftOver: 0 });
  });

  it("takes nothing when there is no room, or nothing was chosen", () => {
    expect(galleryRoom(0, 3)).toEqual({ take: 0, leftOver: 3 });
    expect(galleryRoom(4, 0)).toEqual({ take: 0, leftOver: 0 });
  });
});

describe("readableSize and savingLine", () => {
  it("writes megabytes with one decimal and everything smaller in whole kilobytes", () => {
    expect(readableSize(3.2 * 1024 * 1024)).toBe("3.2 MB");
    expect(readableSize(85_000)).toBe("83 KB");
    expect(readableSize(10)).toBe("1 KB");
  });

  it("shows before and after, and nothing when either is missing", () => {
    expect(savingLine(3.2 * 1024 * 1024, 85_000)).toBe("3.2 MB → 83 KB");
    expect(savingLine(0, 85_000)).toBeNull();
    expect(savingLine(1000, 0)).toBeNull();
  });

  it("says nothing when the stored photo is not smaller than the original", () => {
    expect(savingLine(79 * 1024, 143 * 1024)).toBeNull();
    expect(savingLine(85_000, 85_000)).toBeNull();
  });
});

describe("messages", () => {
  it("names the file and the size that is needed", () => {
    expect(tooSmallMessage("shop.jpg", { width: 480, height: 360 })).toBe("shop.jpg is too small for this spot. Choose a photo at least 480 × 360 pixels.");
    expect(notAnImageMessage("notes.pdf")).toBe("We couldn't open notes.pdf. Use a JPEG, PNG or WebP image.");
  });

  it("says how many were added and how many were left out", () => {
    expect(tooManyMessage(1, 1)).toBe("Your gallery has room for 1 photo, so we added the first 1 and left 1 photo out.");
    expect(tooManyMessage(2, 3)).toBe("Your gallery has room for 2 photos, so we added the first 2 and left 3 photos out.");
    expect(tooManyMessage(0, 2)).toBe("Your gallery is full. Remove a photo to add another.");
  });
});

describe("photosStatus", () => {
  it("asks for the feature photo first", () => {
    expect(photosStatus(false, true)).toEqual({ tone: "waiting", text: "Add a feature photo to go live" });
    expect(photosStatus(false, false)).toEqual({ tone: "waiting", text: "Add a feature photo to go live" });
  });

  it("then says whether the photos are showing yet", () => {
    expect(photosStatus(true, true)).toEqual({ tone: "done", text: "Live on your page" });
    expect(photosStatus(true, false)).toEqual({ tone: "quiet", text: "Shows on your page once you publish" });
  });
});
