import "server-only";
import { MAX_REWARD_BASIS_POINTS } from "@brandbasket/billing";
import {
  billingCurrency,
  cancelAffiliateEarning,
  createAffiliate,
  findAffiliateById,
  issueAffiliateLoginLink,
  listAffiliateCodeCurrencies,
  recordAffiliatePayout,
  updateAffiliate,
  type Affiliate,
  type AffiliateDetails,
  type BillingCurrency,
  type ReferralReward,
} from "@brandbasket/db";
import { formatPercent, parsePercent } from "@brandbasket/shared/lib/billing/referral-value";
import { AFFILIATE_LOGIN_LINK_DAYS, affiliateSetupPath } from "@brandbasket/shared/lib/affiliate-links";
import { parseMoney } from "@brandbasket/shared/lib/money";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { getStaffDb } from "./db";

// The same words in the staff console and on the affiliate's own dashboard, so they live in shared.
export { describeAffiliateReward, describeRewardCycles } from "@brandbasket/shared/lib/billing/referral-value";

/**
 * The staff console's side of affiliates: creating and editing them, recording the transfers that pay them, and
 * cancelling an earning that should not be paid. Every field is validated here, on the server, whatever the form
 * allowed.
 */

/** Which form field a refusal belongs to, so the console can mark and focus it. */
export type AffiliateField =
  | "name"
  | "email"
  | "phone"
  | "rewardKind"
  | "rewardValue"
  | "rewardCurrency"
  | "rewardCycles"
  | "notes"
  | "paidOn"
  | "reference"
  | "withheld"
  | "withheldReason";

export interface AffiliateRefusal {
  readonly message: string;
  readonly field: AffiliateField | null;
}

export type AffiliateAdminOutcome =
  | { readonly kind: "saved"; readonly affiliate: Affiliate }
  | { readonly kind: "paid"; readonly amountCents: number }
  | { readonly kind: "cancelled" }
  | { readonly kind: "refused"; readonly refusal: AffiliateRefusal };

function refused(message: string, field: AffiliateField | null): { readonly kind: "refused"; readonly refusal: AffiliateRefusal } {
  return { kind: "refused", refusal: { message, field } };
}

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_NOTES_LENGTH = 2000;
const MAX_REFERENCE_LENGTH = 100;
const MAX_WITHHELD_REASON_LENGTH = 200;
/** Ten years of months: a limit past that is no limit, and is better left blank. */
const MAX_REWARD_CYCLES = 120;
/** Looks like an email at all. Deliverability is not this form's job. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CALENDAR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** A number typed without a country code is read as Indian, where nearly every affiliate is. */
const DEFAULT_PHONE_COUNTRY = "IN";
/** Transfers are made from India, so "today" for a payout is India's today, not the server's UTC one. */
const PAYOUT_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** Today's date in India as `YYYY-MM-DD`: the payout form's starting value and the latest date it accepts. */
export function payoutToday(now: Date): string {
  return PAYOUT_DATE_FORMAT.format(now);
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isCurrency(value: string): value is BillingCurrency {
  return (billingCurrency.enumValues as readonly string[]).includes(value);
}

type Read<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: { readonly kind: "refused"; readonly refusal: AffiliateRefusal } };

/** A phone typed any reasonable way, as E.164; null when left blank, undefined when it is not a phone number. */
function optionalPhone(raw: string): string | null | undefined {
  if (raw === "") return null;
  const parsed = parsePhoneNumberFromString(raw, DEFAULT_PHONE_COUNTRY);
  return parsed?.isValid() === true ? parsed.number : undefined;
}

/**
 * What they earn for each month a member they brought pays: a flat amount in one currency, or a share of each
 * payment before GST and after the member's discount. Blank is a flat nothing, in rupees unless said otherwise.
 */
function readReward(formData: FormData): Read<{ readonly reward: ReferralReward; readonly currency: BillingCurrency | null }> {
  const kind = text(formData, "rewardKind") || "amount";
  const raw = text(formData, "rewardValue");
  if (kind === "percent") {
    const basisPoints = parsePercent(raw);
    return basisPoints === null || basisPoints < 1 || basisPoints > MAX_REWARD_BASIS_POINTS
      ? {
          ok: false,
          refusal: refused(
            `A share of each payment, from 0.01% to ${formatPercent(MAX_REWARD_BASIS_POINTS)}, like 10 or 12.5.`,
            "rewardValue",
          ),
        }
      : { ok: true, value: { reward: { kind: "percent", basisPoints }, currency: null } };
  }
  if (kind !== "amount") return { ok: false, refusal: refused("Choose an amount or a percentage.", "rewardKind") };
  const currencyRaw = text(formData, "rewardCurrency") || "INR";
  if (!isCurrency(currencyRaw)) return { ok: false, refusal: refused("Choose the currency they are paid in.", "rewardCurrency") };
  const amountCents = raw === "" ? 0 : parseMoney(raw);
  return amountCents === null
    ? { ok: false, refusal: refused("What they earn each month, as an amount like 200 or 12.50.", "rewardValue") }
    : { ok: true, value: { reward: { kind: "amount", amountCents }, currency: currencyRaw } };
}

/** Everything the affiliate form says about them, checked. */
function readDetails(formData: FormData): Read<AffiliateDetails> {
  const name = text(formData, "name");
  if (name === "" || name.length > MAX_NAME_LENGTH) return { ok: false, refusal: refused("Give their name.", "name") };

  const emailRaw = text(formData, "email");
  if (emailRaw !== "" && (!EMAIL_PATTERN.test(emailRaw) || emailRaw.length > MAX_EMAIL_LENGTH)) {
    return { ok: false, refusal: refused("That email address doesn’t look right.", "email") };
  }
  const phone = optionalPhone(text(formData, "phone"));
  if (phone === undefined) return { ok: false, refusal: refused("That phone number doesn’t look right.", "phone") };
  const email = emailRaw === "" ? null : emailRaw;
  if (email === null && phone === null) {
    return { ok: false, refusal: refused("Give a phone number or an email, so they can be reached.", "phone") };
  }

  const rewardRead = readReward(formData);
  if (!rewardRead.ok) return rewardRead;

  // Blank is every paid month. Otherwise how many of each member's paid months earn; the member's discount is not
  // affected by it.
  const cyclesRaw = text(formData, "rewardCycles");
  const rewardCycles = cyclesRaw === "" ? null : Number(cyclesRaw);
  if (rewardCycles !== null && (!Number.isInteger(rewardCycles) || rewardCycles < 1 || rewardCycles > MAX_REWARD_CYCLES)) {
    return {
      ok: false,
      refusal: refused(`A whole number of months from 1 to ${MAX_REWARD_CYCLES}, or blank for every month.`, "rewardCycles"),
    };
  }

  const notesRaw = text(formData, "notes");
  if (notesRaw.length > MAX_NOTES_LENGTH) return { ok: false, refusal: refused("Those notes are too long.", "notes") };

  return {
    ok: true,
    value: {
      name,
      email,
      phone,
      reward: rewardRead.value.reward,
      rewardCurrency: rewardRead.value.currency,
      rewardCycles,
      notes: notesRaw === "" ? null : notesRaw,
    },
  };
}

export async function createAffiliateFor(input: {
  readonly formData: FormData;
  readonly staffUserId: string;
}): Promise<AffiliateAdminOutcome> {
  const read = readDetails(input.formData);
  if (!read.ok) return read.refusal;
  const affiliate = await createAffiliate(getStaffDb(), { ...read.value, createdByStaffId: input.staffUserId });
  return { kind: "saved", affiliate };
}

/**
 * Saves an affiliate. A new reward applies to payments recorded from now on; earnings already written keep their
 * amount. A flat reward is paid in one currency, so it is refused in a currency some of their codes are not in:
 * payments on those codes could not earn anything.
 */
export async function updateAffiliateFor(input: {
  readonly affiliateId: string;
  readonly formData: FormData;
}): Promise<AffiliateAdminOutcome> {
  const read = readDetails(input.formData);
  if (!read.ok) return read.refusal;
  const staffDb = getStaffDb();
  const { rewardCurrency } = read.value;
  if (rewardCurrency !== null) {
    const codeCurrencies = await listAffiliateCodeCurrencies(staffDb, input.affiliateId);
    const other = codeCurrencies.find((currency) => currency !== rewardCurrency);
    if (other !== undefined) {
      return refused(
        `They have ${other} codes, so a fixed reward in ${rewardCurrency} could not be earned on them. Use a percentage.`,
        "rewardCurrency",
      );
    }
  }
  const affiliate = await updateAffiliate(staffDb, {
    ...read.value,
    id: input.affiliateId,
    active: input.formData.get("active") === "on",
  });
  return affiliate === null ? refused("That affiliate no longer exists.", null) : { kind: "saved", affiliate };
}

/**
 * Records the bank or UPI transfer that paid everything an affiliate was owed in one currency. The form carries the
 * ids of the earnings it showed; if anything was earned or cancelled since, the payout is refused and the page shows
 * the new total, so a transfer can never be recorded against money it did not include.
 */
export async function recordPayoutFor(input: {
  readonly affiliateId: string;
  readonly formData: FormData;
  readonly staffUserId: string;
  readonly now: Date;
}): Promise<AffiliateAdminOutcome> {
  const { formData } = input;
  const currency = text(formData, "currency");
  if (!isCurrency(currency)) return refused("That payout could not be read. Reload the page and try again.", null);
  const earningIds = text(formData, "earningIds")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
  const paidOn = text(formData, "paidOn");
  if (!CALENDAR_DATE_PATTERN.test(paidOn) || !Number.isFinite(new Date(`${paidOn}T00:00:00Z`).getTime())) {
    return refused("When did the transfer go out?", "paidOn");
  }
  // YYYY-MM-DD strings compare in date order. A transfer cannot have gone out after today.
  if (paidOn > payoutToday(input.now)) return refused("That date is in the future. When did the transfer go out?", "paidOn");
  const reference = text(formData, "reference");
  if (reference === "" || reference.length > MAX_REFERENCE_LENGTH) {
    return refused("Give the bank or UPI reference of the transfer.", "reference");
  }

  // Something kept back from the transfer (tax deducted at source, a bank fee): optional, and always with its reason.
  const withheldTyped = text(formData, "withheld");
  const withheldCents = withheldTyped === "" ? 0 : parseMoney(withheldTyped);
  if (withheldCents === null) return refused("What was withheld, as an amount like 200 or 12.50, or leave it blank.", "withheld");
  const reasonTyped = text(formData, "withheldReason");
  if (withheldCents > 0 && (reasonTyped === "" || reasonTyped.length > MAX_WITHHELD_REASON_LENGTH)) {
    return refused("Say why it was withheld, in a few words.", "withheldReason");
  }

  const outcome = await recordAffiliatePayout(getStaffDb(), {
    affiliateId: input.affiliateId,
    currency,
    earningIds,
    paidOn,
    reference,
    withheldCents,
    // A reason typed beside nothing withheld is dropped: the two come together or not at all.
    withheldReason: withheldCents > 0 ? reasonTyped : null,
    recordedByStaffId: input.staffUserId,
  });
  switch (outcome.kind) {
    case "recorded":
      return { kind: "paid", amountCents: outcome.amountCents };
    case "stale":
      return refused("What they’re owed changed while this page was open. Check the new total and record it again.", null);
    case "nothing-owed":
      return refused(`Nothing is owed in ${currency} any more.`, null);
    case "bad-withheld":
      return refused("That is as much as the whole payout, or more. Withhold less than what is being paid.", "withheld");
    default: {
      const unhandled: never = outcome;
      throw new Error(`Unhandled payout outcome: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Cancels an earning still owed, for instance because the member's payment was refunded. Paid ones stay. */
export async function cancelEarningFor(input: {
  readonly affiliateId: string;
  readonly earningId: string;
  readonly staffUserId: string;
  readonly now: Date;
}): Promise<AffiliateAdminOutcome> {
  const cancelled = await cancelAffiliateEarning(getStaffDb(), input);
  return cancelled ? { kind: "cancelled" } : refused("That earning is no longer owed, so it was left as it is.", null);
}

export type LoginLinkOutcome =
  | { readonly kind: "link"; readonly url: string; readonly expiresAt: Date }
  | { readonly kind: "refused"; readonly refusal: AffiliateRefusal };

/**
 * Opens a link for the affiliate to choose a password by, replacing any link already open. The same link serves a first
 * sign-in and a forgotten password. The link is shown to staff once and never stored: the database holds only its hash,
 * so a link nobody copied is replaced, not recovered.
 */
export async function issueLoginLinkFor(input: {
  readonly affiliateId: string;
  /** The customer app's origin, which serves the page the link opens. */
  readonly appOrigin: string;
  readonly now?: Date;
}): Promise<LoginLinkOutcome> {
  const issued = await issueAffiliateLoginLink(getStaffDb(), {
    affiliateId: input.affiliateId,
    expiresInDays: AFFILIATE_LOGIN_LINK_DAYS,
    ...(input.now === undefined ? {} : { now: input.now }),
  });
  if (issued.kind === "issued") {
    return { kind: "link", url: new URL(affiliateSetupPath(issued.token), input.appOrigin).toString(), expiresAt: issued.expiresAt };
  }
  if (issued.kind === "no-email") return refused("Add their email first: it is what they sign in with.", "email");
  return refused("That affiliate no longer exists.", null);
}

/** Looks an affiliate up for a page, null when the id is unknown. */
export async function findAffiliate(affiliateId: string): Promise<Affiliate | null> {
  return findAffiliateById(getStaffDb(), affiliateId);
}
