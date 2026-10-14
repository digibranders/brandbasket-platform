import type { Affiliate, ReferralDiscount, ReferralReward, ReferralValue } from "@fynix/db";
import { formatMoney, type MoneyCurrency } from "@fynix/shared/lib/money";

/**
 * How a referral code's discount and reward read, wherever they are shown: the staff console's list, detail page
 * and create form, and the customer's own Check and send. One module, so a percentage never reads "10%" in one
 * place and "10.00 percent" in another.
 *
 * Only `import type` from the database package: this reaches client components, and a value import would pull the
 * database driver into the browser bundle.
 */

const BASIS_POINTS_PER_PERCENT = 100;

/** "10", "12.5", "12.34" and "0.01", each optionally followed by a "%"; nothing signed, nothing with a third decimal. */
const PERCENT_PATTERN = /^([0-9]+)(?:\.([0-9]{1,2}))?$/;

/** A percentage held in basis points, as a person reads it: "10%", "12.5%", "12.34%". Never trailing zeros. */
export function formatPercent(basisPoints: number): string {
  if (!Number.isSafeInteger(basisPoints)) {
    throw new RangeError(`A percentage must be a whole number of basis points, received ${basisPoints}`);
  }
  const whole = Math.trunc(basisPoints / BASIS_POINTS_PER_PERCENT);
  const hundredths = Math.abs(basisPoints % BASIS_POINTS_PER_PERCENT);
  if (hundredths === 0) return `${whole}%`;
  return `${whole}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}%`;
}

/** A discount as it reads beside a code: "₹500 off" or "12.5% off". */
export function describeReferralDiscount(discount: ReferralDiscount, currency: MoneyCurrency): string {
  return `${valueWords(discount, currency)} off`;
}

/** A referrer's reward: "₹200 a month" or "10% of each payment". */
export function describeReferralReward(reward: ReferralReward, currency: MoneyCurrency): string {
  return reward.kind === "amount"
    ? `${formatMoney(reward.amountCents, currency)} a month`
    : `${formatPercent(reward.basisPoints)} of each payment`;
}

/** An affiliate's reward as a person reads it: "₹200 a month" or "10% of each payment". */
export function describeAffiliateReward(affiliate: Pick<Affiliate, "reward" | "rewardCurrency">): string {
  if (affiliate.reward.kind === "percent") return `${formatPercent(affiliate.reward.basisPoints)} of each payment`;
  if (affiliate.reward.amountCents === 0) return "Nothing";
  return `${formatMoney(affiliate.reward.amountCents, affiliate.rewardCurrency ?? "INR")} a month`;
}

/** How long a member earns the affiliate their reward: "every paid month" or "first 12 paid months". */
export function describeRewardCycles(rewardCycles: number | null): string {
  if (rewardCycles === null) return "every paid month";
  return rewardCycles === 1 ? "first paid month only" : `first ${rewardCycles} paid months`;
}

/** True for a code that owes its referrer nothing: a flat reward of 0. A percentage reward is always at least 0.01%. */
export function isNoReward(reward: ReferralReward): boolean {
  return reward.kind === "amount" && reward.amountCents === 0;
}

function valueWords(value: ReferralValue, currency: MoneyCurrency): string {
  return value.kind === "amount" ? formatMoney(value.amountCents, currency) : formatPercent(value.basisPoints);
}

/**
 * Reads a percentage a person typed ("10", "12.5", "12.34%") as whole basis points. Returns null rather than
 * rounding, so "12.345" is refused instead of silently becoming a rate nobody agreed to. Range is the caller's to
 * check: a discount and a reward allow different maximums. Built on the digits, not a float, for the same reason
 * parseMoney is: 12.34 × 100 in floating point is 1233.9999999999998.
 */
export function parsePercent(typed: string): number | null {
  const cleaned = typed.trim().replace(/\s*%$/, "");
  const match = PERCENT_PATTERN.exec(cleaned);
  if (match === null) return null;
  const [, whole = "", fraction = ""] = match;
  const basisPoints = Number(whole) * BASIS_POINTS_PER_PERCENT + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(basisPoints) ? basisPoints : null;
}
