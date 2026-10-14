/**
 * Writes the tiny images the media upload tests use. The outputs are committed; run this only to recreate them:
 *
 *   node apps/platform/lib/server/__fixtures__/generate-media-fixtures.mts
 *
 * The JPEG carries an EXIF block written by hand below, rather than by sharp, so the fixture is guaranteed to hold
 * a GPS position and an orientation whatever the image library does.
 */
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const HERE = new URL("./", import.meta.url);

/** A little-endian TIFF/EXIF block: IFD0 with Orientation = 6 and a pointer to a GPS IFD holding a position. */
function exifWithGpsAndOrientation(): Buffer {
  const entries0 = 2;
  const ifd0Offset = 8;
  const ifd0Size = 2 + entries0 * 12 + 4;
  const gpsOffset = ifd0Offset + ifd0Size;
  const gpsEntries = 4;
  const gpsSize = 2 + gpsEntries * 12 + 4;
  const latOffset = gpsOffset + gpsSize;
  const lonOffset = latOffset + 24;
  const tiff = Buffer.alloc(lonOffset + 24);

  // Header: "II", 42, offset of IFD0.
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifd0Offset, 4);

  let at = ifd0Offset;
  tiff.writeUInt16LE(entries0, at);
  at += 2;
  // 0x0112 Orientation, SHORT, 1 value: 6 (rotate 90° clockwise to display).
  tiff.writeUInt16LE(0x0112, at);
  tiff.writeUInt16LE(3, at + 2);
  tiff.writeUInt32LE(1, at + 4);
  tiff.writeUInt16LE(6, at + 8);
  at += 12;
  // 0x8825 GPSInfo IFD pointer, LONG.
  tiff.writeUInt16LE(0x8825, at);
  tiff.writeUInt16LE(4, at + 2);
  tiff.writeUInt32LE(1, at + 4);
  tiff.writeUInt32LE(gpsOffset, at + 8);
  at += 12;
  tiff.writeUInt32LE(0, at);

  at = gpsOffset;
  tiff.writeUInt16LE(gpsEntries, at);
  at += 2;
  const asciiRef = (tag: number, value: string): void => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(2, at + 2);
    tiff.writeUInt32LE(2, at + 4);
    tiff.write(`${value}\0`, at + 8, "ascii");
    at += 12;
  };
  const rationals = (tag: number, offset: number): void => {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(5, at + 2);
    tiff.writeUInt32LE(3, at + 4);
    tiff.writeUInt32LE(offset, at + 8);
    at += 12;
  };
  asciiRef(0x0001, "N");
  rationals(0x0002, latOffset);
  asciiRef(0x0003, "W");
  rationals(0x0004, lonOffset);
  tiff.writeUInt32LE(0, at);

  // 51° 30' 26", 0° 7' 39": degrees, minutes, seconds as n/1.
  for (const [offset, values] of [
    [latOffset, [51, 30, 26]],
    [lonOffset, [0, 7, 39]],
  ] as const) {
    values.forEach((value, index) => {
      tiff.writeUInt32LE(value, offset + index * 8);
      tiff.writeUInt32LE(1, offset + index * 8 + 4);
    });
  }

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "ascii"), tiff]);
  const marker = Buffer.from([0xff, 0xe1, 0, 0]);
  marker.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([marker, payload]);
}

// 48 wide by 24 tall as stored; orientation 6 makes it display 24 wide by 48 tall.
const plainJpeg = await sharp({ create: { width: 48, height: 24, channels: 3, background: "#4a7c59" } })
  .jpeg({ quality: 60 })
  .toBuffer();
// Insert the EXIF segment straight after the SOI marker.
const jpeg = Buffer.concat([plainJpeg.subarray(0, 2), exifWithGpsAndOrientation(), plainJpeg.subarray(2)]);
await writeFile(new URL("gps-orientation.jpg", HERE), jpeg);

const png = await sharp({ create: { width: 20, height: 10, channels: 4, background: "#f4e9d8" } })
  .png()
  .toBuffer();
await writeFile(new URL("logo.png", HERE), png);

await writeFile(new URL("not-an-image.png", HERE), "These are my notes, not a picture.\n");

console.log("Media fixtures written.");
