import "server-only";
import { createDatabase, type Database } from "@brandbasket/db";
import { z } from "zod";
import { serverEnv } from "./env";

// Kept on globalThis so hot reloads in development reuse pools instead of opening new ones.
const holder = globalThis as typeof globalThis & {
  brandbasketCustomerAppDb?: Database;
  brandbasketCustomerStaffDb?: Database;
  brandbasketCustomerPublicDb?: Database;
};

/**
 * Customer work, bound by row-level security. Every query runs inside withTenantScope (business data) or withUserScope
 * (the user's own rows) from @brandbasket/db, with ids taken from a guard's context, never from the request.
 */
export function getAppDb(): Database {
  holder.brandbasketCustomerAppDb ??= createDatabase(serverEnv().DATABASE_URL).db;
  return holder.brandbasketCustomerAppDb;
}

/**
 * The staff connection bypasses row-level security. Customer-facing code never uses it, except the sanctioned cases
 * below. A new exception needs the same kind of justification written here, in the same commit.
 *
 * - src/lib/guards.ts, reading the signed-in user's own open account closure (account_closures is staff-only). The user id
 *   comes only from the session; it reads one row's existence and erase date, and writes nothing.
 * - src/lib/guards.ts, reading the signed-in user's own affiliate record (requireAffiliate). The affiliate tables are
 *   staff-only by design and an affiliate has no business to scope a customer connection under. The user id comes only
 *   from the session, so an affiliate can only ever read their own record.
 * - src/features/enquiries/conversation.ts, reading the OyeChats operator key of one chatbot (chatbot keys are staff-only).
 *   The chat lead is first found through row-level security on the app connection, so another business's id is refused
 *   before any key is read; the key stays on the server and is never returned.
 * - src/features/requests/server.ts, three system writes the app role cannot make: request rate-limit rows (keyed by the
 *   session user), opening the charge for an accepted quote (the business comes from the session tenant and the database
 *   function checks the request belongs to it), and queueing the staff alert email in the outbox (a reference and link
 *   only, never the request text).
 * - src/app/api/support-uploads/route.ts, the support screenshot upload and its delete: the per-user advisory lock, the
 *   check that the signed-in user's account is not closing (account_closures is staff-only), confirming a staged row after
 *   its file is stored, and marking a removed file purged. The user id comes only from the session guard, and each call is
 *   scoped to that user's own rows.
 * - src/app/api/error-reports/route.ts, writing a sanitized browser error report and its hashed rate-limit counters (both
 *   tables are staff-only). No customer data is read; the session user, when there is one, is only the report's author.
 *
 * Ported from the old app with the same uses it made (apps/platform lib/server/db.ts). In each, the user and business come
 * only from the session guard, never from the request:
 * - src/features/entry/server/*: sign-up, email code, setup link and security event rows, written before a workspace exists.
 * - src/features/checkout/server/* and src/features/restore/server.ts: billing reads and writes under the billing lock
 *   (plan, state, referral code, subscription, payment, charge order, discount plans), the fake provider confirm, the
 *   user's own account closure, payment receipt and team alert outbox writes. The billing tables are staff-only.
 * - src/features/conversions/server.ts: payment and attribution reads and one conversion claim per payment.
 * - src/features/calls/server/calls.ts: the kickoff booking link site setting and the business's call outcomes.
 * - src/features/website/{actions,alerts,loader}.ts and domain/actions.ts: preview approval, revisions and the feedback
 *   transaction (the round is counted under a row lock), preview versions, the support rate limit, recording a DNS check,
 *   and team alert transports.
 * - src/features/billing/server/*: adding, keeping and removing a service through checkout's basket functions under the
 *   billing lock, and the referral-code and reactivation reads, as the old /services page did (owner only).
 * - src/features/blog/server/unlock.ts: the blog allowance unlock the old app made on the staff connection.
 * - src/features/settings/server/{account-exit,export-download}.ts: closing an account under the billing lock (owner only),
 *   and the read-only data download of the user's own records and, for owners, their business's records.
 * - src/features/team/loader.ts: listing the session business's members (owner only, read only); a member can read only
 *   their own business_members row under RLS. src/features/team/actions.ts: accepting an invitation, the only insert into
 *   business_members; the token is the guard, the user and email come from the session, rate limited per user.
 * - src/features/affiliate/server/{dashboard,setup}.ts: the affiliate tables are staff-only. The dashboard reads the
 *   session's own affiliate; setup is keyed by a single-use token and rate limited per network.
 */
export function getStaffDb(): Database {
  holder.brandbasketCustomerStaffDb ??= createDatabase(serverEnv().DATABASE_URL_STAFF).db;
  return holder.brandbasketCustomerStaffDb;
}

const publicEnvSchema = z.object({ DATABASE_URL_PUBLIC: z.url({ protocol: /^postgres(ql)?$/ }) });

/**
 * The intake connection (bb_public): it may only insert leads, rate-limit rows and outbox messages, so a mistake on a path
 * used by someone who is not signed in (a password reset email, say) cannot read customer data. Read lazily, so the app
 * runs without DATABASE_URL_PUBLIC until a feature needs it.
 */
export function getPublicDb(): Database {
  if (holder.brandbasketCustomerPublicDb === undefined) {
    const parsed = publicEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("DATABASE_URL_PUBLIC is missing or not a postgres URL. Add it to apps/customer/.env.local.");
    }
    holder.brandbasketCustomerPublicDb = createDatabase(parsed.data.DATABASE_URL_PUBLIC, { max: 5 }).db;
  }
  return holder.brandbasketCustomerPublicDb;
}
