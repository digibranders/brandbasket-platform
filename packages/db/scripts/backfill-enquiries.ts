import { parseArgs } from "node:util";
import { createDatabase } from "../src/client";
import { loadLocalEnv, requireEnv } from "../src/local-env";
import { backfillEnquiries } from "../src/queries/enquiries";

/*
 * Fills `enquiries` from chatbot_leads and the call, WhatsApp and form taps in site_events, on the staff connection.
 * Safe to run again: each row remembers where it came from, so nothing is added twice and no status or note changes.
 *   pnpm --filter @brandbasket/db enquiries:backfill                     every business
 *   pnpm --filter @brandbasket/db enquiries:backfill --business <uuid>   one business
 */

const { values } = parseArgs({ options: { business: { type: "string" } } });

loadLocalEnv();
const handle = createDatabase(requireEnv("DATABASE_URL_STAFF"), { max: 1 });
try {
  const result = await backfillEnquiries(handle.db, values.business === undefined ? {} : { businessId: values.business });
  console.log(`Enquiries backfilled: ${result.chat} from chat leads, ${result.taps} from site taps.`);
} finally {
  await handle.close();
}
