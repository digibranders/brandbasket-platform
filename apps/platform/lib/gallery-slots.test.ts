import { DIRECTORY_PICTURE_SLOTS } from "@brandbasket/db";
import { GALLERY_SLOTS, PICTURE_KIND_SLOTS, PICTURE_SHAPES, PICTURE_SLOT_LABELS, parsePictureKind } from "@brandbasket/shared/lib/directory/pictures";
import { describe, expect, it } from "vitest";
import { MAX_GALLERY_PHOTOS } from "@/lib/directory-api";

describe("gallery slots", () => {
  it("are twenty, numbered from 1, and the feed allows as many photos", () => {
    expect(GALLERY_SLOTS).toHaveLength(20);
    expect(GALLERY_SLOTS.map((slot, index) => slot === `gallery_${String(index + 1)}`)).not.toContain(false);
    expect(MAX_GALLERY_PHOTOS).toBe(GALLERY_SLOTS.length);
  });

  it("are all values of the database's slot enum, so an upload to any of them is accepted", () => {
    for (const slot of GALLERY_SLOTS) expect(DIRECTORY_PICTURE_SLOTS).toContain(slot);
  });

  it("each have a 4 : 3 shape, a label, and an upload kind of their own", () => {
    for (const slot of GALLERY_SLOTS) {
      expect(PICTURE_SHAPES[slot]).toEqual({ width: 960, height: 720 });
      expect(PICTURE_SLOT_LABELS[slot]).toMatch(/^Gallery photo \d+$/);
      expect(parsePictureKind(slot)).toBe(slot);
      expect(PICTURE_KIND_SLOTS[slot]).toEqual([slot]);
    }
  });
});
