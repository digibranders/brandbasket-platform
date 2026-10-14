import { describe, expect, it } from "vitest";
import { InvalidMediaKeyError, isPictureCopyWidth, keysOfPicture, mediaStorageKey, pictureCopyKey, staffAdPictureKey, validateMediaKey } from "./media-keys";

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const MEDIA = "0192f3c4-2222-7000-8000-000000000002";

describe("picture copies", () => {
  it("names a copy next to its picture", () => {
    const display = mediaStorageKey(BUSINESS, MEDIA, "display");
    expect(pictureCopyKey(display, 320)).toBe(`t/${BUSINESS}/${MEDIA}/w320`);
    expect(pictureCopyKey(display, 640)).toBe(`t/${BUSINESS}/${MEDIA}/w640`);
  });

  it("builds copy keys the storage accepts", () => {
    expect(mediaStorageKey(BUSINESS, MEDIA, "w320")).toBe(`t/${BUSINESS}/${MEDIA}/w320`);
  });

  it("gives no copy key for a key that is not a picture's display key", () => {
    expect(pictureCopyKey(mediaStorageKey(BUSINESS, MEDIA, "w320"), 640)).toBeNull();
    expect(pictureCopyKey("t/short/key", 640)).toBeNull();
  });

  it("lists a picture's own key and all its copies, and any other key alone", () => {
    const display = mediaStorageKey(BUSINESS, MEDIA, "display");
    expect(keysOfPicture(display)).toEqual([display, `t/${BUSINESS}/${MEDIA}/w320`, `t/${BUSINESS}/${MEDIA}/w640`]);
    const copy = mediaStorageKey(BUSINESS, MEDIA, "w320");
    expect(keysOfPicture(copy)).toEqual([copy]);
    expect(keysOfPicture("t/short/key")).toEqual(["t/short/key"]);
  });

  it("knows which widths a picture is copied to", () => {
    expect(isPictureCopyWidth(320)).toBe(true);
    expect(isPictureCopyWidth(640)).toBe(true);
    expect(isPictureCopyWidth(321)).toBe(false);
    expect(isPictureCopyWidth(0)).toBe(false);
  });

  it("keeps a staff ad's picture under staff-ads/, built only from a lowercase UUID, and valid as a storage key", () => {
    const key = staffAdPictureKey(MEDIA);
    expect(key).toBe(`staff-ads/${MEDIA}/display`);
    expect(() => validateMediaKey(key)).not.toThrow();
    expect(keysOfPicture(key)).toEqual([key, `staff-ads/${MEDIA}/w320`, `staff-ads/${MEDIA}/w640`]);
    expect(() => staffAdPictureKey("../etc/passwd")).toThrow(InvalidMediaKeyError);
    expect(() => staffAdPictureKey(MEDIA.toUpperCase())).toThrow(InvalidMediaKeyError);
  });
});
