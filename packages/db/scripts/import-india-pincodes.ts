import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase } from "../src/client";
import { parseIndiaPostCsv } from "../src/india-post";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { upsertPincodes } from "../src/queries/india-pincodes";

/*
 * Loads India Post's PIN code directory (data.gov.in, GODL-India) into india_pincodes, on the staff connection. Safe to
 * run again: every PIN is upserted.
 *
 *   pnpm directory:import-pincodes <path to pincode-directory.csv> [--min=<PIN codes>]
 *
 * A file for a few states only (local-directory-data/india/pdf_to_pincode_csv.py, from India Post's per-circle PDFs)
 * holds far fewer PINs than the whole country: pass the least it should have, e.g. --min=2500, to load it.
 */

/** India has about 19,000 PINs: a file with far fewer is the wrong file, so nothing is written. */
const MIN_PINCODES = 15_000;
const USAGE = "Usage: pnpm directory:import-pincodes <path to pincode-directory.csv> [--min=<PIN codes>]";

interface ImportArgs {
  readonly path: string;
  readonly minPincodes: number;
}

function parseArgs(args: readonly string[]): ImportArgs {
  let path: string | undefined;
  let minPincodes = MIN_PINCODES;
  for (const arg of args) {
    const min = /^--min=([1-9][0-9]*)$/.exec(arg);
    if (min?.[1] !== undefined) minPincodes = Number(min[1]);
    else if (arg.startsWith("--") || path !== undefined) throw new Error(USAGE);
    else path = arg;
  }
  if (path === undefined) throw new Error(USAGE);
  return { path, minPincodes };
}

async function main(): Promise<void> {
  const { path, minPincodes } = parseArgs(process.argv.slice(2));
  const { records, problems } = parseIndiaPostCsv(readFileSync(resolve(path), "utf8"));
  for (const problem of problems) console.warn(problem);
  if (records.length < minPincodes) {
    throw new Error(
      minPincodes === MIN_PINCODES
        ? `Only ${records.length} PIN codes read; India has about 19,000. Is this the full directory? (For a few states, pass --min.)`
        : `Only ${records.length} PIN codes read; expected at least ${minPincodes}.`,
    );
  }

  loadLocalEnv();
  // The import runs as firstfold_staff, the only role that may write the table (0085).
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
  try {
    const written = await upsertPincodes(db, records, new Date());
    console.log(`Wrote ${written} PIN codes (${problems.length} problems above).`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
