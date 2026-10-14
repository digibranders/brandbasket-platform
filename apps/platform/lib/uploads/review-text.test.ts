import { describe, expect, it } from "vitest";
import { enlargedNote, formatBytes, minimumSizeText, reviewLine, tooSmallText } from "./review-text";
import { largestOf } from "./review-text";

describe("formatBytes", () => {
  it("writes small sizes in KB and large ones in MB, to one decimal where it helps", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(512)).toBe("1 KB");
    expect(formatBytes(21_008)).toBe("21 KB");
    expect(formatBytes(52_640)).toBe("53 KB");
    expect(formatBytes(999_499)).toBe("999 KB");
    expect(formatBytes(999_999)).toBe("1.0 MB");
    expect(formatBytes(1_048_576)).toBe("1.0 MB");
    expect(formatBytes(4_285_977)).toBe("4.3 MB");
  });

  it("never writes a negative or non-numeric size", () => {
    expect(formatBytes(-5)).toBe("0 KB");
    expect(formatBytes(Number.NaN)).toBe("0 KB");
  });
});

describe("reviewLine", () => {
  it("says what will be uploaded and what the photo was", () => {
    expect(reviewLine({ width: 960, height: 600, bytes: 55_292 }, { width: 3000, height: 2250, bytes: 5_628_225 })).toBe(
      "960 × 600 px, 55 KB. Your photo was 3000 × 2250 px, 5.6 MB.",
    );
  });

  it("does not claim a saving when the picture came out larger than the original", () => {
    expect(reviewLine({ width: 960, height: 600, bytes: 90_000 }, { width: 700, height: 500, bytes: 40_000 })).toBe(
      "960 × 600 px, 90 KB. Your photo was 700 × 500 px, 40 KB.",
    );
  });
});

describe("minimumSizeText", () => {
  it("names the smallest photo that can be used for a spot", () => {
    expect(minimumSizeText({ width: 320, height: 320 })).toBe("Smallest photo for this spot: 320 × 320 px. A bigger one looks sharper.");
  });
});

describe("largestOf", () => {
  it("is the size a photo needs to be big enough for every one of several spots", () => {
    expect(largestOf([{ width: 480, height: 540 }, { width: 480, height: 300 }])).toEqual({ width: 480, height: 540 });
    expect(largestOf([{ width: 300, height: 600 }, { width: 500, height: 200 }])).toEqual({ width: 500, height: 600 });
    expect(largestOf([{ width: 320, height: 320 }])).toEqual({ width: 320, height: 320 });
  });

  it("is nothing when there are no spots", () => {
    expect(largestOf([])).toEqual({ width: 0, height: 0 });
  });
});

describe("tooSmallText", () => {
  it("says how small the chosen photo is and what the spot needs", () => {
    expect(tooSmallText({ width: 300, height: 200 }, { width: 480, height: 360 })).toBe(
      "This photo is too small: it is 300 × 200 px, and this spot needs at least 480 × 360 px.",
    );
  });
});

describe("enlargedNote", () => {
  it("warns when the part of the photo shown has to be stretched to fill the picture", () => {
    expect(enlargedNote({ width: 480, height: 360 }, { width: 960, height: 720 })).toBe(
      "Your photo is smaller than this spot, so it was enlarged and may look a little soft.",
    );
    expect(enlargedNote({ width: 959, height: 720 }, { width: 960, height: 720 })).not.toBeNull();
    expect(enlargedNote({ width: 960, height: 719 }, { width: 960, height: 720 })).not.toBeNull();
  });

  it("says nothing when the photo is at least as big as the picture", () => {
    expect(enlargedNote({ width: 960, height: 720 }, { width: 960, height: 720 })).toBeNull();
    expect(enlargedNote({ width: 3000, height: 2250 }, { width: 960, height: 720 })).toBeNull();
  });
});
