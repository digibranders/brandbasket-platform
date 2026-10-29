import { crc32 } from "node:zlib";

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly modifiedAt: Date;
}

const METHOD_STORE = 0;
const VERSION_NEEDED = 20;
/** General purpose flag bit 11: file names are UTF-8. */
const FLAG_UTF8_NAMES = 0x0800;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_RECORD_SIGNATURE = 0x06054b50;
const MAX_ENTRIES = 0xffff;
const MAX_NAME_BYTES = 255;
const FOUR_GIB = 0x1_0000_0000;
/** The DOS date cannot hold years before 1980 or after 2107. */
const DOS_FIRST_MS = Date.UTC(1980, 0, 1, 0, 0, 0);
const DOS_LAST_MS = Date.UTC(2107, 11, 31, 23, 59, 58);

const encoder = new TextEncoder();

/**
 * Builds a ZIP archive with every entry stored, not compressed. Refuses input it cannot write correctly with a
 * RangeError: no entries, more than 65535, a duplicate or unsafe name, or a file or archive of 4 GiB or more.
 */
export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length === 0) throw new RangeError("A zip needs at least one entry");
  if (entries.length > MAX_ENTRIES) throw new RangeError(`A zip holds at most ${MAX_ENTRIES} entries, got ${entries.length}`);

  const names = new Set<string>();
  const prepared = entries.map((entry) => {
    if (names.has(entry.name)) throw new RangeError(`Duplicate zip entry name: ${entry.name}`);
    names.add(entry.name);
    if (entry.data.byteLength >= FOUR_GIB) throw new RangeError(`Zip entry ${entry.name} is 4 GiB or larger`);
    return { name: encodeName(entry.name), data: entry.data, time: dosDateTime(entry.modifiedAt) };
  });

  const archiveSize = prepared.reduce(
    (total, { name, data }) => total + LOCAL_HEADER_SIZE + name.byteLength + data.byteLength + CENTRAL_HEADER_SIZE + name.byteLength,
    END_RECORD_SIZE,
  );
  // shortcut: no ZIP64, a month of invoices is a few MB
  if (archiveSize >= FOUR_GIB) throw new RangeError("A zip archive of 4 GiB or larger is not supported");

  let localEnd = 0;
  const records = prepared.map((item) => {
    const offset = localEnd;
    localEnd += LOCAL_HEADER_SIZE + item.name.byteLength + item.data.byteLength;
    return { ...item, checksum: crc32(item.data), offset };
  });

  const archive = new Uint8Array(archiveSize);
  const view = new DataView(archive.buffer);

  let cursor = 0;
  for (const { name, data, time, checksum } of records) {
    view.setUint32(cursor, LOCAL_HEADER_SIGNATURE, true);
    view.setUint16(cursor + 4, VERSION_NEEDED, true);
    view.setUint16(cursor + 6, FLAG_UTF8_NAMES, true);
    view.setUint16(cursor + 8, METHOD_STORE, true);
    view.setUint16(cursor + 10, time.time, true);
    view.setUint16(cursor + 12, time.date, true);
    view.setUint32(cursor + 14, checksum, true);
    view.setUint32(cursor + 18, data.byteLength, true);
    view.setUint32(cursor + 22, data.byteLength, true);
    view.setUint16(cursor + 26, name.byteLength, true);
    view.setUint16(cursor + 28, 0, true);
    archive.set(name, cursor + LOCAL_HEADER_SIZE);
    archive.set(data, cursor + LOCAL_HEADER_SIZE + name.byteLength);
    cursor += LOCAL_HEADER_SIZE + name.byteLength + data.byteLength;
  }

  const centralStart = cursor;
  for (const { name, data, time, checksum, offset } of records) {
    view.setUint32(cursor, CENTRAL_HEADER_SIGNATURE, true);
    view.setUint16(cursor + 4, VERSION_NEEDED, true);
    view.setUint16(cursor + 6, VERSION_NEEDED, true);
    view.setUint16(cursor + 8, FLAG_UTF8_NAMES, true);
    view.setUint16(cursor + 10, METHOD_STORE, true);
    view.setUint16(cursor + 12, time.time, true);
    view.setUint16(cursor + 14, time.date, true);
    view.setUint32(cursor + 16, checksum, true);
    view.setUint32(cursor + 20, data.byteLength, true);
    view.setUint32(cursor + 24, data.byteLength, true);
    view.setUint16(cursor + 28, name.byteLength, true);
    view.setUint16(cursor + 30, 0, true);
    view.setUint16(cursor + 32, 0, true);
    view.setUint16(cursor + 34, 0, true);
    view.setUint16(cursor + 36, 0, true);
    view.setUint32(cursor + 38, 0, true);
    view.setUint32(cursor + 42, offset, true);
    archive.set(name, cursor + CENTRAL_HEADER_SIZE);
    cursor += CENTRAL_HEADER_SIZE + name.byteLength;
  }

  view.setUint32(cursor, END_RECORD_SIGNATURE, true);
  view.setUint16(cursor + 4, 0, true);
  view.setUint16(cursor + 6, 0, true);
  view.setUint16(cursor + 8, records.length, true);
  view.setUint16(cursor + 10, records.length, true);
  view.setUint32(cursor + 12, cursor - centralStart, true);
  view.setUint32(cursor + 16, centralStart, true);
  view.setUint16(cursor + 20, 0, true);

  return archive;
}

function encodeName(name: string): Uint8Array {
  if (name === "") throw new RangeError("A zip entry needs a name");
  if (name.startsWith("/")) throw new RangeError(`Zip entry name must be relative: ${name}`);
  if (name.includes("\\")) throw new RangeError(`Zip entry name must use "/" as separator: ${name}`);
  if (name.split("/").includes("..")) throw new RangeError(`Zip entry name must not contain "..": ${name}`);
  const bytes = encoder.encode(name);
  if (bytes.byteLength > MAX_NAME_BYTES) throw new RangeError(`Zip entry name is longer than ${MAX_NAME_BYTES} bytes: ${name}`);
  return bytes;
}

/** The DOS time and date fields, in UTC, clamped to the range the format can hold. */
function dosDateTime(modifiedAt: Date): { readonly time: number; readonly date: number } {
  const ms = modifiedAt.getTime();
  if (Number.isNaN(ms)) throw new RangeError("A zip entry needs a valid modification date");
  const clamped = new Date(Math.min(Math.max(ms, DOS_FIRST_MS), DOS_LAST_MS));
  const time = (clamped.getUTCHours() << 11) | (clamped.getUTCMinutes() << 5) | Math.floor(clamped.getUTCSeconds() / 2);
  const date = ((clamped.getUTCFullYear() - 1980) << 9) | ((clamped.getUTCMonth() + 1) << 5) | clamped.getUTCDate();
  return { time, date };
}
