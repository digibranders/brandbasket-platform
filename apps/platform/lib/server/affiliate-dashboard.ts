import "server-only";
import {
  findAffiliateCashOut,
  listAffiliateCodeUsage,
  listAffiliateEarnings,
  listAffiliateMonthlyActivity,
  listAffiliateMembers,
  listAffiliatePayouts,
  listReferralCodes,
  type Affiliate,
  type AffiliateCashOut,
  type AffiliateCodeUsage,
  type AffiliateEarning,
  type AffiliateMonthlyActivity,
  type AffiliatePayout,
  type ListedReferralCode,
} from "@fynix/db";
import { monthsWindowStart } from "@/lib/affiliate-dashboard";
import { getStaffDb } from "./db";

const CODE_LIMIT = 50;
const MEMBER_LIMIT = 500;
const EARNING_LIMIT = 100;
const PAYOUT_LIMIT = 50;
/** How many months the monthly strip shows, the current one included. */
export const MONTHS_SHOWN = 6;

/** Everything an affiliate's dashboard shows, for the one affiliate it is handed. */
export interface AffiliateDashboard {
  readonly codes: readonly ListedReferralCode[];
  /** How each code has been used, by code id: who paid on it and what discount it has given. A code nobody paid on has none. */
  readonly usage: ReadonlyMap<string, AffiliateCodeUsage>;
  /** How many businesses have paid on one of their codes, and how many of those are still paying. */
  readonly members: { readonly total: number; readonly paying: number };
  /** Earned, cashed out, withheld, received and pending, in each currency they have money in. */
  readonly cashOut: readonly AffiliateCashOut[];
  /** Who paid, what it earned and what was refunded, by month, for the last MONTHS_SHOWN months. */
  readonly monthly: readonly AffiliateMonthlyActivity[];
  readonly earnings: readonly AffiliateEarning[];
  readonly payouts: readonly AffiliatePayout[];
}

/**
 * Reads an affiliate's codes, members, money and payouts. The affiliate is the signed-in user's own (see
 * ./affiliate-access.ts): this is never called with an id from a request. Who the members are stays with staff: the
 * dashboard shows how many there are and what they earned, not their business names.
 */
export async function loadAffiliateDashboard(affiliate: Affiliate, now: Date = new Date()): Promise<AffiliateDashboard> {
  const db = getStaffDb();
  const [codes, usage, members, earnings, payouts, cashOut, monthly] = await Promise.all([
    listReferralCodes(db, { affiliateId: affiliate.id }, CODE_LIMIT),
    listAffiliateCodeUsage(db, affiliate.id),
    listAffiliateMembers(db, affiliate.id, MEMBER_LIMIT),
    listAffiliateEarnings(db, affiliate.id, EARNING_LIMIT),
    listAffiliatePayouts(db, affiliate.id, PAYOUT_LIMIT),
    findAffiliateCashOut(db, affiliate.id),
    listAffiliateMonthlyActivity(db, affiliate.id, monthsWindowStart(now, MONTHS_SHOWN)),
  ]);
  return {
    codes,
    usage: new Map(usage.map((row) => [row.codeId, row])),
    members: { total: members.length, paying: members.filter((member) => member.status === "active").length },
    cashOut,
    monthly,
    earnings,
    payouts,
  };
}
