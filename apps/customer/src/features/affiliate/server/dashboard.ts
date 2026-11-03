import "server-only";
import {
  findAffiliateCashOut,
  listAffiliateCodeUsage,
  listAffiliateEarnings,
  listAffiliateMembers,
  listAffiliateMonthlyActivity,
  listAffiliatePayouts,
  listReferralCodes,
  type Affiliate,
  type AffiliateCashOut,
  type AffiliateCodeUsage,
  type AffiliateEarning,
  type AffiliateMonthlyActivity,
  type AffiliatePayout,
  type ListedReferralCode,
} from "@brandbasket/db";
import { getStaffDb } from "@/lib/db";
import { monthsWindowStart } from "../rules/dashboard";
import { countMembers, type MemberCounts } from "../rules/members";

/*
 * Ported from apps/platform lib/server/affiliate-dashboard.ts, one reader per panel so a failed one shows its own error state.
 * Staff connection: the affiliate tables are staff-only by design and an affiliate has no business to scope a customer
 * connection under (sanctioned in src/lib/db.ts). Every reader takes the Affiliate that requireAffiliate found from the
 * session's user, never an id from a request. Who the members are stays with staff: only counts are shown.
 */

const CODE_LIMIT = 50;
/** Earnings and payouts are lists of the latest rows; the panel says how many it shows. */
export const EARNING_LIMIT = 100;
export const PAYOUT_LIMIT = 50;
/** How many months the monthly table shows, the current one included. */
export const MONTHS_SHOWN = 6;

export interface CodesView {
  readonly codes: readonly ListedReferralCode[];
  /** How each code has been used, by code id. A code nobody paid on has none. */
  readonly usage: ReadonlyMap<string, AffiliateCodeUsage>;
}

export async function loadCodes(affiliate: Affiliate): Promise<CodesView> {
  const db = getStaffDb();
  const [codes, usage] = await Promise.all([listReferralCodes(db, { affiliateId: affiliate.id }, CODE_LIMIT), listAffiliateCodeUsage(db, affiliate.id)]);
  return { codes, usage: new Map(usage.map((row) => [row.codeId, row])) };
}

export interface FiguresView {
  readonly members: MemberCounts;
  readonly cashOut: readonly AffiliateCashOut[];
}

export async function loadFigures(affiliate: Affiliate): Promise<FiguresView> {
  const db = getStaffDb();
  const [members, cashOut] = await Promise.all([countMembers((limit) => listAffiliateMembers(db, affiliate.id, limit)), findAffiliateCashOut(db, affiliate.id)]);
  return { members, cashOut };
}

export async function loadMonthly(affiliate: Affiliate, now: Date): Promise<readonly AffiliateMonthlyActivity[]> {
  return listAffiliateMonthlyActivity(getStaffDb(), affiliate.id, monthsWindowStart(now, MONTHS_SHOWN));
}

export async function loadEarnings(affiliate: Affiliate): Promise<readonly AffiliateEarning[]> {
  return listAffiliateEarnings(getStaffDb(), affiliate.id, EARNING_LIMIT);
}

export async function loadPayouts(affiliate: Affiliate): Promise<readonly AffiliatePayout[]> {
  return listAffiliatePayouts(getStaffDb(), affiliate.id, PAYOUT_LIMIT);
}
