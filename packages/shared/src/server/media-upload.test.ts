import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUSY_MESSAGE,
  BUSY_RETRY_AFTER_SECONDS,
  detectImageType,
  hasDecodeCapacity,
  makePictureCopies,
  MAX_CONCURRENT_DECODES,
  MAX_INPUT_PIXELS,
  MAX_UPLOAD_BYTES,
  MAX_WAITING_DECODES,
  processUpload,
  UploadRejectedError,
} from "./media-upload";

vi.mock("server-only", () => ({}));
// The real sharp, wrapped so a test can prove an upload was refused without ever being decoded.
vi.mock("sharp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sharp")>();
  return { default: vi.fn(actual.default) };
});

const mockedSharp = vi.mocked(sharp);

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(new URL(`./__fixtures__/${name}`, import.meta.url)));
}

/**
 * An upload as the route hands it over: only the bytes. Whatever name and type the uploader claimed never reach
 * processUpload, so a file named .jpg that is really a PNG is just its bytes here.
 */
function upload(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

async function rejectionOf(input: Uint8Array): Promise<UploadRejectedError> {
  try {
    await processUpload(input);
  } catch (error) {
    if (error instanceof UploadRejectedError) return error;
    throw error;
  }
  throw new Error("Expected the upload to be refused.");
}

beforeEach(async () => {
  const actual = await vi.importActual<typeof import("sharp")>("sharp");
  mockedSharp.mockReset();
  mockedSharp.mockImplementation(actual.default);
});

describe("detectImageType", () => {
  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageType(new TextEncoder().encode("RIFF\x10\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
  });

  it("refuses everything else, including HEIC, SVG, GIF and a RIFF that is not WebP", () => {
    const refused = [
      new Uint8Array([0, 0, 0, 0x18, ...new TextEncoder().encode("ftypheic")]),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'),
      new TextEncoder().encode("GIF89a"),
      new TextEncoder().encode("RIFF\x10\x00\x00\x00WAVEfmt "),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      new Uint8Array([]),
    ];
    for (const head of refused) expect(detectImageType(head)).toBeNull();
  });
});

describe("processUpload", () => {
  it("strips a phone photo's GPS position and other EXIF, and turns it upright", async () => {
    const original = await fixture("gps-orientation.jpg");
    // The fixture really carries what we are removing: orientation 6 and a GPS IFD pointer (tag 0x8825).
    const before = await sharp(original).metadata();
    expect(before).toMatchObject({ format: "jpeg", width: 48, height: 24, orientation: 6 });
    expect(before.exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true);

    const result = await processUpload(upload(original));

    const after = await sharp(result.bytes).metadata();
    expect(after.format).toBe("webp");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(after.orientation).toBeUndefined();
    // Rotated by the orientation before the tag was dropped, so it displays the same way.
    expect([after.width, after.height]).toEqual([24, 48]);
    expect(result).toMatchObject({
      mimeType: "image/webp",
      width: 24,
      height: 48,
      byteLength: result.bytes.byteLength,
      sourceType: "image/jpeg",
      sha256: createHash("sha256").update(result.bytes).digest("hex"),
    });
  });

  it("cuts an image to an exact size about its centre, and enlarges one that is too small", async () => {
    const wide = await fixture("logo.png");
    expect(await processUpload(upload(wide), { width: 8, height: 8 })).toMatchObject({ mimeType: "image/webp", width: 8, height: 8 });
    const enlarged = await processUpload(upload(wide), { width: 40, height: 45 });
    expect(enlarged).toMatchObject({ width: 40, height: 45 });
    expect(await sharp(enlarged.bytes).metadata()).toMatchObject({ format: "webp", width: 40, height: 45 });
  });

  it("turns a phone photo upright before cutting it to an exact size", async () => {
    // 48 x 24 stored sideways (orientation 6), so upright it is 24 x 48: a 12 x 24 cut keeps all of it.
    const result = await processUpload(upload(await fixture("gps-orientation.jpg")), { width: 12, height: 24 });
    expect(result).toMatchObject({ width: 12, height: 24 });
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
  });

  it("identifies a PNG named .jpg as a PNG", async () => {
    const result = await processUpload(upload(await fixture("logo.png")));
    expect(result).toMatchObject({ sourceType: "image/png", mimeType: "image/webp", width: 20, height: 10 });
  });

  it("refuses a text file named .png, whatever type the browser declared", async () => {
    const rejection = await rejectionOf(upload(await fixture("not-an-image.png")));
    expect(rejection.reason).toBe("unsupported-type");
    expect(rejection.message).toBe("That file isn't an image we can use. Please upload a JPEG, PNG or WebP image.");
    expect(mockedSharp).not.toHaveBeenCalled();
  });

  it("refuses an SVG even when it is declared as one", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await rejectionOf(upload(svg))).reason).toBe("unsupported-type");
    expect(mockedSharp).not.toHaveBeenCalled();
  });

  it("refuses an oversized file without decoding it", async () => {
    const png = await fixture("logo.png");
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    oversized.set(png);

    const rejection = await rejectionOf(upload(oversized));

    expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
    expect(rejection.reason).toBe("too-large");
    expect(rejection.message).toBe("That file is larger than 4 MB. Please upload a smaller image.");
    expect(mockedSharp).not.toHaveBeenCalled();
  });

  it("decodes with an explicit pixel limit and sequential reads", async () => {
    await processUpload(upload(await fixture("logo.png")));
    expect(mockedSharp).toHaveBeenCalledWith(expect.any(Uint8Array), {
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true,
    });
    expect(MAX_INPUT_PIXELS).toBe(100_000_000);
  });

  it("refuses an image whose header claims more pixels than the limit", async () => {
    // A 10,001 x 10,000 blank PNG compresses to a few kilobytes but would decode to 400 MB of pixels.
    const huge = await sharp({ create: { width: 10_001, height: 10_000, channels: 3, background: "#000000" } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(huge.byteLength).toBeLessThan(MAX_UPLOAD_BYTES);
    expect((await rejectionOf(upload(new Uint8Array(huge)))).reason).toBe("unreadable");
  });

  it("decodes at most two uploads at once", async () => {
    const png = await fixture("logo.png");
    const actual = await vi.importActual<typeof import("sharp")>("sharp");
    let running = 0;
    let peak = 0;
    mockedSharp.mockImplementation(((...args: Parameters<typeof actual.default>) => {
      const instance = actual.default(...args);
      const metadata = instance.metadata.bind(instance);
      instance.metadata = (async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return metadata();
      }) as typeof instance.metadata;
      const toBuffer = instance.toBuffer.bind(instance);
      instance.toBuffer = (async (options: { resolveWithObject: true }) => {
        try {
          return await toBuffer(options);
        } finally {
          running -= 1;
        }
      }) as typeof instance.toBuffer;
      return instance;
    }) as typeof actual.default);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => processUpload(upload(png))),
    );

    expect(results).toHaveLength(6);
    expect(MAX_CONCURRENT_DECODES).toBe(2);
    expect(peak).toBe(2);
    expect(running).toBe(0);
  });

  it("refuses an upload at once as busy when two are decoding and eight are waiting", async () => {
    const png = await fixture("logo.png");
    const actual = await vi.importActual<typeof import("sharp")>("sharp");
    let openGate: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    mockedSharp.mockImplementation(((...args: Parameters<typeof actual.default>) => {
      const instance = actual.default(...args);
      const metadata = instance.metadata.bind(instance);
      instance.metadata = (async () => {
        await gate;
        return metadata();
      }) as typeof instance.metadata;
      return instance;
    }) as typeof actual.default);

    const admitted = Array.from({ length: MAX_CONCURRENT_DECODES + MAX_WAITING_DECODES }, () =>
      processUpload(upload(png)),
    );
    expect(hasDecodeCapacity()).toBe(false);
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
    expect(mockedSharp).toHaveBeenCalledTimes(MAX_CONCURRENT_DECODES);

    const rejection = await rejectionOf(upload(png));
    expect(MAX_WAITING_DECODES).toBe(8);
    expect(rejection).toMatchObject({ reason: "busy", message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS });
    expect(BUSY_MESSAGE).toBe("We're handling a lot of uploads right now. Please try that image again in a few seconds.");
    // Refused before a decoder was even created for it.
    expect(mockedSharp).toHaveBeenCalledTimes(MAX_CONCURRENT_DECODES);

    openGate();
    const results = await Promise.all(admitted);
    expect(results.every((result) => result.sourceType === "image/png")).toBe(true);
    // Once the line has cleared, uploads are admitted again.
    expect(hasDecodeCapacity()).toBe(true);
    await expect(processUpload(upload(png))).resolves.toMatchObject({ sourceType: "image/png" });
  });

  it("gives other refusals no retry hint", async () => {
    expect((await rejectionOf(upload(new Uint8Array()))).retryAfterSeconds).toBeNull();
  });

  it("accepts a file of exactly the limit as far as decoding", async () => {
    const png = await fixture("logo.png");
    const atLimit = new Uint8Array(MAX_UPLOAD_BYTES);
    atLimit.set(png);
    // Trailing bytes after the PNG end are ignored by the decoder, so this is a valid image at the size limit.
    const result = await processUpload(upload(atLimit));
    expect(result.sourceType).toBe("image/png");
  });

  it("refuses an empty file", async () => {
    expect((await rejectionOf(upload(new Uint8Array()))).reason).toBe("empty");
  });

  it("refuses a file with an image signature that does not decode", async () => {
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const rejection = await rejectionOf(upload(broken));
    expect(rejection.reason).toBe("unreadable");
    expect(rejection.message).toBe(
      "We couldn't read that image. It may be damaged. Please upload a JPEG, PNG or WebP image.",
    );
  });

  it("scales a large image to fit within 2400px and leaves a small one its size", async () => {
    const wide = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: "#ffffff" } })
      .png()
      .toBuffer();
    const scaled = await processUpload(upload(new Uint8Array(wide)));
    expect([scaled.width, scaled.height]).toEqual([2400, 800]);

    const small = await processUpload(upload(await fixture("logo.png")));
    expect([small.width, small.height]).toEqual([20, 10]);
  });

  it("re-encodes a WebP upload too", async () => {
    const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#000000" } })
      .webp()
      .withExif({ IFD0: { Copyright: "Someone" } })
      .toBuffer();
    expect((await sharp(webp).metadata()).exif).toBeDefined();

    const result = await processUpload(upload(new Uint8Array(webp)));
    expect(result.sourceType).toBe("image/webp");
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
  });
});

describe("makePictureCopies", () => {
  async function picture(width: number, height: number): Promise<Uint8Array> {
    return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#cc3333" } }).webp().toBuffer());
  }

  it("makes a 320 and a 640 px copy of a 960 x 600 picture, in the same proportions", async () => {
    const copies = await makePictureCopies(await picture(960, 600));
    expect(copies.map((copy) => copy.width)).toEqual([320, 640]);
    for (const copy of copies) {
      expect(await sharp(copy.bytes).metadata()).toMatchObject({ format: "webp", width: copy.width, height: copy.height });
    }
    expect(copies.map((copy) => copy.height)).toEqual([200, 400]);
  });

  it("makes only the 320 px copy of a 640 px picture", async () => {
    expect((await makePictureCopies(await picture(640, 640))).map((copy) => copy.width)).toEqual([320]);
  });

  it("makes nothing for a picture no wider than the smallest copy", async () => {
    expect(await makePictureCopies(await picture(320, 200))).toEqual([]);
    expect(await makePictureCopies(await picture(200, 200))).toEqual([]);
  });

  it("makes copies that are smaller in bytes than the picture", async () => {
    const noise = Buffer.alloc(960 * 600 * 3);
    for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 7919 + (index >> 3) * 104729) & 0xff;
    const original = new Uint8Array(await sharp(noise, { raw: { width: 960, height: 600, channels: 3 } }).webp({ quality: 82 }).toBuffer());
    const copies = await makePictureCopies(original);
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect(copy.bytes.byteLength).toBeLessThan(original.byteLength);
  });
});
