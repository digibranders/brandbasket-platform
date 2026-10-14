import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase } from "../src/client";
import {
  dropUnlistedPhones,
  parseListingsFile,
  parsePhonesFile,
  toListingInputs,
} from "../src/directory-listing-file";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { syncOpenListings } from "../src/queries/directory-open-listings";

/*
 * Makes directory_open_listings match one dataset build, on the staff connection. Takes the two files the build writes
 * into the website (website-listing/content/local): thane-listings.json and thane-site-phones.json. Run it after
 * `pnpm directory:import-places` with the same build's ledger, so every place id exists. Safe to run again: only
 * changed rows are written, and a business the build dropped is hidden, not deleted.
 * A number in the phones file for a business the listings file lacks is skipped and counted: the website never shows
 * it either, since it looks phones up by listing.
 *
 * A build that would hide an empty or unusually large part of the directory (see syncOpenListings) is refused; if that
 * is really intended, add --allow-mass-hide.
 *
 *   pnpm directory:import-listings <thane-listings.json> <thane-site-phones.json> [--allow-mass-hide]
 */

const USAGE = "Usage: pnpm directory:import-listings <thane-listings.json> <thane-site-phones.json> [--allow-mass-hide]";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const allowMassHide = args.includes("--allow-mass-hide");
  const paths = args.filter((arg) => arg !== "--allow-mass-hide");
  const unknownFlag = paths.find((arg) => arg.startsWith("--"));
  if (unknownFlag !== undefined) throw new Error(`Unknown option ${unknownFlag}. ${USAGE}`);
  const [listingsPath, phonesPath] = paths;
  if (listingsPath === undefined || phonesPath === undefined || paths.length !== 2) throw new Error(USAGE);
  // pnpm runs the script from packages/db; a relative path means relative to where the command was typed.
  const base = process.env.INIT_CWD ?? process.cwd();
  const listings = parseListingsFile(readFileSync(resolve(base, listingsPath), "utf8"));
  const { listed, dropped } = dropUnlistedPhones(
    listings,
    parsePhonesFile(readFileSync(resolve(base, phonesPath), "utf8")),
  );
  const rows = toListingInputs(listings, listed);

  loadLocalEnv();
  // directory_open_listings is staff-only (0090), like the routes that read it.
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
  try {
    const result = await syncOpenListings(db, rows, { allowMassHide });
    console.log(
      `Directory listings: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ` +
        `${result.hidden} hidden, from ${rows.length} rows (${listed.size} with a phone; ` +
        `${dropped.length} phones skipped for businesses not listed).`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
