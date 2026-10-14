import { stateCodeOfIndiaPostName } from "./india-states";

/*
 * India Post's "All India Pincode Directory" (data.gov.in, GODL-India) turned into one record per PIN code: its state,
 * its district and the post offices in it, which the Listing tab offers as localities. Pure: the import script
 * (scripts/import-india-pincodes.ts) reads the file and writes the records. Fields are comma-separated; a field may be
 * quoted (RFC 4180, within one line), and the file may start with a byte order mark.
 */

export const INDIA_POST_HEADER = [
  "circlename",
  "regionname",
  "divisionname",
  "officename",
  "pincode",
  "officetype",
  "delivery",
  "district",
  "statename",
  "latitude",
  "longitude",
] as const;

export interface PincodeLocality {
  readonly slug: string;
  readonly name: string;
}

export interface PincodeRecord {
  readonly pincode: string;
  readonly stateCode: string;
  readonly districtSlug: string;
  readonly districtName: string;
  /** A to Z by name; never empty. */
  readonly localities: readonly PincodeLocality[];
}

export interface IndiaPostParse {
  readonly records: readonly PincodeRecord[];
  /** Rows skipped and PINs settled by a choice, one line each, for the import to print. */
  readonly problems: readonly string[];
}

const PIN = /^[1-9][0-9]{5}$/;
/**
 * The office type, and the town India Post may add after it to tell same-named offices apart: "S.O", "S.O (Thane)",
 * "SO North 24 Parganas". Everything from the type on goes; a name that is only a type is kept as it is.
 */
const OFFICE_SUFFIX = /\s+(?:[BSH]\.?\s?O\.?|G\.?P\.?O\.?)(?:\s*\([^()]*\)|\s+\S.*)?$/i;

/** "Salt Lake Sector V S.O" -> "Salt Lake Sector V": the office type is not part of the place's name. */
export function cleanOfficeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().replace(OFFICE_SUFFIX, "").trim();
}

/** "North 24 Parganas" -> "north-24-parganas". */
export function toSlug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "NORTH 24 PARGANAS" -> "North 24 Parganas". */
function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(.-])([a-z])/g, (_match, before: string, letter: string) => before + letter.toUpperCase());
}

/** Splits one CSV line on commas outside quotes; `"` opens or closes a quoted field and `""` inside one is a quote. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line.charAt(i);
    if (quoted) {
      if (char === '"' && line.charAt(i + 1) === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

interface Office {
  readonly stateCode: string;
  readonly districtSlug: string;
  readonly districtName: string;
  readonly name: string;
}

export function parseIndiaPostCsv(text: string): IndiaPostParse {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((cell) => cell.trim().toLowerCase());
  if (header.join(",") !== INDIA_POST_HEADER.join(",")) {
    throw new Error(`Not India Post's pincode directory: the header is "${lines[0] ?? ""}", expected "${INDIA_POST_HEADER.join(",")}"`);
  }
  const problems: string[] = [];
  const offices = new Map<string, Office[]>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim() === "") continue;
    const cells = splitCsvLine(line);
    const pincode = (cells[4] ?? "").trim();
    const state = (cells[8] ?? "").trim();
    const district = (cells[7] ?? "").trim();
    const name = cleanOfficeName(cells[3] ?? "");
    if (!PIN.test(pincode)) {
      problems.push(`line ${index + 1}: bad PIN ${JSON.stringify(pincode)}`);
      continue;
    }
    const stateCode = stateCodeOfIndiaPostName(state);
    if (stateCode === null) {
      problems.push(`line ${index + 1}: unknown state ${JSON.stringify(state)}`);
      continue;
    }
    if (district === "" || toSlug(name) === "") {
      problems.push(`line ${index + 1}: no district or office name`);
      continue;
    }
    const list = offices.get(pincode) ?? [];
    list.push({ stateCode, districtSlug: toSlug(district), districtName: titleCase(district), name });
    offices.set(pincode, list);
  }

  const records: PincodeRecord[] = [];
  for (const [pincode, list] of [...offices].sort(([a], [b]) => a.localeCompare(b))) {
    const byDistrict = new Map<string, Office[]>();
    for (const office of list) {
      const key = `${office.stateCode}/${office.districtSlug}`;
      const group = byDistrict.get(key);
      if (group === undefined) byDistrict.set(key, [office]);
      else group.push(office);
    }
    const ranked = [...byDistrict.values()].sort(
      (a, b) => b.length - a.length || (a[0]?.districtSlug ?? "").localeCompare(b[0]?.districtSlug ?? ""),
    );
    const kept = ranked[0];
    if (kept === undefined) continue;
    const first = kept[0];
    if (first === undefined) continue;
    if (ranked.length > 1) {
      const slugs = ranked.map((group) => group[0]?.districtSlug ?? "");
      problems.push(`${pincode}: offices in ${ranked.length} districts (${slugs.join(", ")}); kept ${first.districtSlug}`);
    }
    const localities = new Map<string, PincodeLocality>();
    for (const office of kept) {
      const slug = toSlug(office.name);
      if (!localities.has(slug)) localities.set(slug, { slug, name: office.name });
    }
    records.push({
      pincode,
      stateCode: first.stateCode,
      districtSlug: first.districtSlug,
      districtName: first.districtName,
      localities: [...localities.values()].sort((a, b) => a.name.localeCompare(b.name, "en-IN")),
    });
  }
  return { records, problems };
}
