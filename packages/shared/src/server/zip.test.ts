import { spawnSync } from "node:child_process";
import { crc32 } from "node:zlib";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createZip, type ZipEntry } from "./zip";

const FOUR_GIB = 0x1_0000_0000;
const MODIFIED = new Date("2026-10-29T10:20:30Z");
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

interface ParsedEntry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly versionNeeded: number;
  readonly time: number;
  readonly date: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
  readonly localName: string;
  readonly localFlags: number;
  readonly localCrc: number;
  readonly data: Uint8Array;
}

interface ParsedZip {
  readonly totalEntries: number;
  readonly centralOffset: number;
  readonly centralSize: number;
  readonly entries: readonly ParsedEntry[];
}

/** Reads an archive without compression or comments: end record, central directory, then each local header. */
function parseZip(bytes: Uint8Array): ParsedZip {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.byteLength - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const totalEntries = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);

  const entries: ParsedEntry[] = [];
  let pos = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    expect(view.getUint32(pos, true)).toBe(0x02014b50);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const offset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));

    expect(view.getUint32(offset, true)).toBe(0x04034b50);
    const localNameLength = view.getUint16(offset + 26, true);
    const localExtraLength = view.getUint16(offset + 28, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const dataStart = offset + 30 + localNameLength + localExtraLength;
    entries.push({
      name,
      flags: view.getUint16(pos + 8, true),
      method: view.getUint16(pos + 10, true),
      versionNeeded: view.getUint16(pos + 6, true),
      time: view.getUint16(pos + 12, true),
      date: view.getUint16(pos + 14, true),
      crc: view.getUint32(pos + 16, true),
      compressedSize,
      size: view.getUint32(pos + 24, true),
      offset,
      localName: decoder.decode(bytes.subarray(offset + 30, offset + 30 + localNameLength)),
      localFlags: view.getUint16(offset + 6, true),
      localCrc: view.getUint32(offset + 14, true),
      data: bytes.subarray(dataStart, dataStart + compressedSize),
    });
    pos += 46 + nameLength + extraLength + commentLength;
  }
  return { totalEntries, centralOffset, centralSize, entries };
}

function fileEntry(name: string, text: string): ZipEntry {
  return { name, data: encoder.encode(text), modifiedAt: MODIFIED };
}

describe("createZip", () => {
  it("writes two stored entries that parse back with their names, sizes, CRCs and offsets", () => {
    const first = fileEntry("invoices/FY-26-27-000001.pdf", "%PDF-1.4 first invoice");
    const second = fileEntry("café/register.csv", "Invoice number,Customer\r\nFY/26-27/000001,Priya\r\n");
    const bytes = createZip([first, second]);
    const zip = parseZip(bytes);

    expect(zip.totalEntries).toBe(2);
    expect(zip.entries.map((entry) => entry.name)).toEqual(["invoices/FY-26-27-000001.pdf", "café/register.csv"]);

    const [one, two] = zip.entries;
    expect(one).toBeDefined();
    expect(two).toBeDefined();
    if (one === undefined || two === undefined) return;

    expect(one.method).toBe(0);
    expect(one.versionNeeded).toBe(20);
    expect(one.size).toBe(first.data.byteLength);
    expect(one.compressedSize).toBe(first.data.byteLength);
    expect(one.crc).toBe(crc32(first.data));
    expect(one.localCrc).toBe(one.crc);
    expect(one.offset).toBe(0);
    expect(decoder.decode(one.data)).toBe("%PDF-1.4 first invoice");

    expect(two.size).toBe(second.data.byteLength);
    expect(two.crc).toBe(crc32(second.data));
    expect(two.localCrc).toBe(two.crc);
    expect(two.offset).toBe(30 + encoder.encode(one.name).byteLength + first.data.byteLength);
    expect(decoder.decode(two.data)).toBe("Invoice number,Customer\r\nFY/26-27/000001,Priya\r\n");
    expect(two.localName).toBe("café/register.csv");

    expect(zip.centralOffset).toBe(two.offset + 30 + encoder.encode(two.name).byteLength + second.data.byteLength);
    expect(zip.centralOffset + zip.centralSize + 22).toBe(bytes.byteLength);
  });

  it("sets the UTF-8 name flag (bit 11) in both the local and the central headers", () => {
    const zip = parseZip(createZip([fileEntry("café/register.csv", "x")]));
    const [entry] = zip.entries;
    expect(entry?.flags).toBe(0x0800);
    expect(entry?.localFlags).toBe(0x0800);
  });

  it("writes the modification time in UTC as DOS time and date fields", () => {
    const zip = parseZip(createZip([fileEntry("a.txt", "a")]));
    const [entry] = zip.entries;
    // 10:20:30 is hour 10, minute 20, and seconds halved to 15.
    expect(entry?.time).toBe((10 << 11) | (20 << 5) | 15);
    // 2026-10-29 is year 46 from 1980, month 10, day 29.
    expect(entry?.date).toBe((46 << 9) | (10 << 5) | 29);
  });

  it("clamps modification times outside the DOS range to its first and last moments", () => {
    const early = parseZip(createZip([{ name: "early.txt", data: encoder.encode("e"), modifiedAt: new Date("1970-01-01T00:00:00Z") }]));
    expect(early.entries[0]?.time).toBe(0);
    expect(early.entries[0]?.date).toBe((0 << 9) | (1 << 5) | 1);

    const late = parseZip(createZip([{ name: "late.txt", data: encoder.encode("l"), modifiedAt: new Date("2200-06-01T00:00:00Z") }]));
    expect(late.entries[0]?.time).toBe((23 << 11) | (59 << 5) | 29);
    expect(late.entries[0]?.date).toBe((127 << 9) | (12 << 5) | 31);
  });

  it("accepts a name of exactly 255 bytes", () => {
    const name = "a".repeat(255);
    expect(parseZip(createZip([fileEntry(name, "x")])).entries[0]?.name).toBe(name);
  });

  it("accepts a dot-dot inside a segment, which is not a path step", () => {
    expect(parseZip(createZip([fileEntry("a/..b.pdf", "x")])).entries[0]?.name).toBe("a/..b.pdf");
  });

  it.each([
    ["no entries", []],
    ["a duplicate name", [fileEntry("same.txt", "a"), fileEntry("same.txt", "b")]],
    ["an empty name", [fileEntry("", "a")]],
    ["a name starting with a slash", [fileEntry("/etc/passwd", "a")]],
    ["a name with a backslash", [fileEntry("invoices\\a.pdf", "a")]],
    ["a name with a dot-dot segment", [fileEntry("invoices/../a.pdf", "a")]],
    ["a name that is only dot-dot", [fileEntry("..", "a")]],
    ["a name longer than 255 bytes", [fileEntry("a".repeat(256), "a")]],
    ["an invalid modification date", [{ name: "bad.txt", data: encoder.encode("a"), modifiedAt: new Date("not a date") }]],
  ])("refuses %s with a RangeError", (_label, entries) => {
    expect(() => createZip(entries)).toThrow(RangeError);
  });

  it("refuses more than 65535 entries with a RangeError", () => {
    const entries = Array.from({ length: 65_536 }, (_, index) => fileEntry(`f${index}.txt`, ""));
    expect(() => createZip(entries)).toThrow(RangeError);
  });

  it("refuses a single file of 4 GiB or more without reading it", () => {
    // Only the length is inspected before the file is refused, so a stand-in with that length is enough.
    const huge = { byteLength: FOUR_GIB } as Uint8Array;
    expect(() => createZip([{ name: "huge.bin", data: huge, modifiedAt: MODIFIED }])).toThrow(RangeError);
  });

  it("refuses an archive of 4 GiB or more without reading the files", () => {
    const half = { byteLength: 2.5 * 1024 ** 3 } as Uint8Array;
    expect(() =>
      createZip([
        { name: "one.bin", data: half, modifiedAt: MODIFIED },
        { name: "two.bin", data: half, modifiedAt: MODIFIED },
      ]),
    ).toThrow(RangeError);
  });

  const hasUnzip = spawnSync("which", ["unzip"]).status === 0;
  it.skipIf(!hasUnzip)("passes unzip -t, which checks every CRC", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "zip-test-"));
    try {
      const file = path.join(dir, "check.zip");
      await writeFile(
        file,
        createZip([
          fileEntry("invoices/FY-26-27-000001.pdf", "%PDF-1.4 first invoice"),
          fileEntry("café/register.csv", "Invoice number,Customer\r\nFY/26-27/000001,Priya\r\n"),
        ]),
      );
      const result = spawnSync("unzip", ["-t", file], { encoding: "utf8" });
      expect(result.status).toBe(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
