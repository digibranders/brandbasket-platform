import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import type { PincodeRecord } from "../india-post";
import { indiaPincodes } from "../schema/india-pincodes";
import type { ScopedTransaction } from "../scope";

type Runner = Database | ScopedTransaction;

const PIN = /^[1-9][0-9]{5}$/;
/** Rows per INSERT: about 19k PINs in all, so roughly 40 statements. */
const UPSERT_BATCH = 500;

/** One PIN's state, district and localities, or null for a PIN India Post's directory does not have. */
export async function findPincode(db: Runner, pincode: string): Promise<PincodeRecord | null> {
  if (!PIN.test(pincode)) return null;
  const rows = await db
    .select({
      pincode: indiaPincodes.pincode,
      stateCode: indiaPincodes.stateCode,
      districtSlug: indiaPincodes.districtSlug,
      districtName: indiaPincodes.districtName,
      localities: indiaPincodes.localities,
    })
    .from(indiaPincodes)
    .where(eq(indiaPincodes.pincode, pincode))
    .limit(1);
  return rows[0] ?? null;
}

/** Writes the directory's records, replacing a PIN's row when it is already there. Returns how many were written. */
export async function upsertPincodes(db: Runner, records: readonly PincodeRecord[], now: Date): Promise<number> {
  let written = 0;
  for (let start = 0; start < records.length; start += UPSERT_BATCH) {
    const batch = records.slice(start, start + UPSERT_BATCH);
    await db
      .insert(indiaPincodes)
      .values(batch.map((record) => ({ ...record, createdAt: now, updatedAt: now })))
      .onConflictDoUpdate({
        target: indiaPincodes.pincode,
        set: {
          stateCode: sql`excluded.state_code`,
          districtSlug: sql`excluded.district_slug`,
          districtName: sql`excluded.district_name`,
          localities: sql`excluded.localities`,
          updatedAt: now,
        },
      });
    written += batch.length;
  }
  return written;
}
