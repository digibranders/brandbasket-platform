import "server-only";
import { AccountAlreadyExistsError, createVerifiedEmailAccountWithGrant } from "@brandbasket/auth";
import {
  consumeRateLimit,
  createUnlistedAccountBusiness,
  findUserByEmail,
  isPhoneAccountEmail,
  phoneNumberIsTaken,
  recordSignupAttribution,
  recordSignupLead,
  setUserPhoneNumber,
  UserAlreadyHasBusinessError,
  type NewSignupAttribution,
} from "@brandbasket/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@brandbasket/shared/lib/client-ip";
import { currencyForCountry } from "@brandbasket/shared/lib/pricing";
import { retryMessage } from "@brandbasket/shared/lib/sign-in-limits";
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import type { JoinCodeStep, JoinInput } from "@/lib/join-form";
import { membershipTierForChoice } from "@/lib/membership";
import { recordAccountTermsConsent } from "./account-consent";
import { confirmAccountEmailCode, requestAccountEmailCode, type AccountEmailCodeLimited } from "./account-email-code";
import { getAuth } from "./auth";
import { reportServerError } from "./error-report";
import { ipRateLimitKey } from "./ip-key";
import { reportSignUpToAds } from "./conversions";
import { getStaffDb } from "./db";
import { signInCustomer } from "./customer-sign-in";

/*
 * The account sign-up: a business owner opens an account and its business, and is signed in. The account is opened with
 * an email address and a password, in two steps: requestJoinCode emails the address a code (./account-email-code.ts), and
 * createListingAccount opens the account, with the address already verified, only once that code is confirmed. Nothing
 * about the owner is stored between the two: the form sends its fields again. The owner's mobile number is a required
 * field: it is checked (a real number of the country picked, held by no other account) before any code is sent, and saved
 * on the account as a contact number, unproven. The business is added on the Listing page after signing in.
 *
 * The staff connection on an unauthenticated page, like the setup link (lib/server/setup.ts): the person has no
 * account yet, so there is no row-level security scope to write under. What keeps it safe: nothing here reads or
 * changes anything that already exists (a new account, a new business), and every attempt is rate limited per network
 * before any work is done.
 */

const JOIN_ATTEMPTS_PER_HOUR = 5;
const ONE_HOUR_SECONDS = 60 * 60;
/**
 * How many times an hour one network may ask the sign-up to email a code. The answer says whether the address already
 * has an account, so this is what stops the form being used to look addresses up.
 */
const JOIN_CODE_REQUESTS_PER_HOUR = 10;

const EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE = "This email already has an account. Sign in instead.";
const PHONE_MISSING_MESSAGE = "Enter your mobile number.";
const PHONE_TAKEN_MESSAGE = "That mobile number is already on an account. Sign in, or use another number.";

/** The mobile number the form sent as E.164, or the message to put right: a number the country picked could not have is refused here. */
function readJoinPhone(input: JoinInput): { readonly ok: true; readonly e164: string } | { readonly ok: false; readonly message: string } {
  const parsed = parsePhoneEntry(input.phone, PHONE_MISSING_MESSAGE);
  if (!parsed.success) return { ok: false, message: parsed.message };
  return parsed.e164 === null ? { ok: false, message: PHONE_MISSING_MESSAGE } : { ok: true, e164: parsed.e164 };
}
const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";

export type JoinCodeOutcome =
  | AccountEmailCodeLimited
  | { readonly kind: "code"; readonly otp: JoinCodeStep }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The first step of the sign-up: emails a code to the owner's address. Refuses, with a message for the form, an address
 * that is not one a person could have (the placeholder of an account opened with a phone number is nobody's inbox), and
 * one that already has an account (they are sent to sign in, and no email is spent on them). Limited per network before
 * the address is looked up, since that answer says which addresses have accounts.
 */
export async function requestJoinCode(input: JoinInput): Promise<JoinCodeOutcome> {
  if (isPhoneAccountEmail(input.email)) return { kind: "refused", message: INVALID_EMAIL_MESSAGE };
  const phone = readJoinPhone(input);
  if (!phone.ok) return { kind: "refused", message: phone.message };

  const clientIp = clientIpFrom(await headers());
  // Before the address is looked up: what follows tells one with an account from one without.
  const budget = await consumeRateLimit(getStaffDb(), `join-code:ip:${ipRateLimitKey(clientIp)}`, {
    limit: JOIN_CODE_REQUESTS_PER_HOUR,
    windowSeconds: ONE_HOUR_SECONDS,
  });
  if (!budget.allowed) return { kind: "limited", scope: "network", retryAfterSeconds: budget.retryAfterSeconds };

  if ((await findUserByEmail(getStaffDb(), input.email)) !== null) return { kind: "refused", message: EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE };
  if (await phoneNumberIsTaken(getStaffDb(), phone.e164)) return { kind: "refused", message: PHONE_TAKEN_MESSAGE };
  const outcome = await requestAccountEmailCode({ email: input.email }, clientIp, new Date());
  switch (outcome.kind) {
    case "sent":
      return { kind: "code", otp: { otpId: outcome.otpId, emailHint: outcome.emailHint, confirmRequired: outcome.confirmRequired } };
    case "limited":
      return outcome;
    case "unavailable":
      return { kind: "refused", message: "We can't email a code right now. Please try again later." };
    case "failed":
      return { kind: "refused", message: "We couldn't email that address. Check it and try again." };
  }
}

export type ListingAccountOutcome =
  | AccountEmailCodeLimited
  | { readonly kind: "created" }
  /** The code was wrong or has run out: the form stays on the code step. */
  | { readonly kind: "wrong-code"; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The second step: opens the account for `input` once the code emailed to its address is confirmed, and signs its owner
 * in. Everything the first step checked is checked again, since the form sends it again. The account is created before
 * the business, as with a setup link; if the business then fails the person can sign in and staff repair it from the
 * Ads page. The business is named after its owner until they add it on the Listing page, unless they gave its name (a
 * Premium sign-up). What the owner chose on the entry page is kept on the business: an owner who chose Premium is held
 * on the payment page until they pay (customer-access.ts).
 */
export async function createListingAccount(input: JoinInput, attribution: NewSignupAttribution | null = null): Promise<ListingAccountOutcome> {
  const requestHeaders = await headers();
  const clientIp = clientIpFrom(requestHeaders);
  if (input.code === null) return { kind: "refused", message: "Enter a 6-digit code." };
  if (isPhoneAccountEmail(input.email)) return { kind: "refused", message: INVALID_EMAIL_MESSAGE };
  // Before the code is spent: a number that cannot be saved must not use up the owner's code.
  const phone = readJoinPhone(input);
  if (!phone.ok) return { kind: "refused", message: phone.message };
  if (await phoneNumberIsTaken(getStaffDb(), phone.e164)) return { kind: "refused", message: PHONE_TAKEN_MESSAGE };

  const confirmed = await confirmAccountEmailCode({ ...input.code, email: input.email }, clientIp, new Date());
  switch (confirmed.kind) {
    case "confirmed":
      break;
    case "wrong_code":
      return {
        kind: "wrong-code",
        message:
          confirmed.triesLeft === null
            ? "Enter a 6-digit code."
            : `That code isn't right. ${confirmed.triesLeft} ${confirmed.triesLeft === 1 ? "try" : "tries"} left.`,
      };
    case "expired":
      return { kind: "wrong-code", message: "That code has run out. Send a new one." };
    case "limited":
      return confirmed;
  }

  // Counted only for a proven address, so a wrong code never spends the network's account budget.
  const budget = await consumeRateLimit(getStaffDb(), `join:client:${ipRateLimitKey(clientIp)}`, {
    limit: JOIN_ATTEMPTS_PER_HOUR,
    windowSeconds: ONE_HOUR_SECONDS,
  });
  if (!budget.allowed) return { kind: "refused", message: retryMessage(budget.retryAfterSeconds) };

  let userId: string;
  let signInAddress: string;
  try {
    const created = await createVerifiedEmailAccountWithGrant(getAuth(), getStaffDb(), { email: input.email, name: input.name, password: input.password });
    userId = created.userId;
    signInAddress = created.email;
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) return { kind: "refused", message: EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE };
    throw error;
  }

  // A contact number, not a sign-in: it stays unproven. If another sign-up took the number in the meantime it is not saved on
  // the account, and the owner is still signed in; staff still have it on the lead.
  await setUserPhoneNumber(getStaffDb(), userId, phone.e164);

  // Proof of what the owner agreed to: written as soon as the account exists, before the business, so a later failure
  // does not lose it.
  await recordAccountTermsConsent(getStaffDb(), userId);

  const businessName = input.businessName ?? input.name;
  try {
    const { businessId } = await createUnlistedAccountBusiness(getStaffDb(), {
      userId,
      businessName,
      signupChoice: input.choice,
      countryCode: input.country,
      stateCode: input.stateCode,
      // A plan is billed in rupees in India and dollars everywhere else; a free listing is in the directory, in India.
      currency: input.choice === "listing_only" ? "INR" : currencyForCountry(input.country),
    });
    await recordLeadForSignup({ name: input.name, businessName, email: signInAddress, businessId, choice: input.choice, userId, phone: phone.e164 });
    if (attribution !== null) {
      await recordAttributionForSignup(businessId, attribution, userId);
      void reportSignUpToAds(attribution);
    }
  } catch (error) {
    // A brand-new account cannot already have a business; if it somehow does, signing in shows it.
    if (!(error instanceof UserAlreadyHasBusinessError)) throw error;
  }

  await signInCustomer({ email: signInAddress, password: input.password }, requestHeaders);
  return { kind: "created" };
}

/**
 * Keeps which ad the account came from (plan 59). Best effort, like the lead: the owner is about to be signed in, and a failure
 * here is reported for staff to see and never stops the sign-up.
 */
async function recordAttributionForSignup(businessId: string, attribution: NewSignupAttribution, userId: string): Promise<void> {
  try {
    await recordSignupAttribution(getStaffDb(), businessId, attribution);
  } catch (error) {
    await reportServerError(error, { app: "platform", operation: "server_action", route: "/join", userId });
  }
}

/**
 * Puts the new account on the staff console's Leads list, so a customer who signs up and never pays can still be
 * followed up. Best effort: the account and business already exist and the owner is about to be signed in, so a failure
 * here is reported for staff to see and never stops the sign-up.
 */
async function recordLeadForSignup(signup: {
  readonly name: string;
  readonly businessName: string;
  readonly email: string;
  readonly businessId: string;
  readonly choice: JoinInput["choice"];
  readonly userId: string;
  readonly phone: string | null;
}): Promise<void> {
  try {
    await recordSignupLead(getStaffDb(), {
      name: signup.name,
      businessName: signup.businessName,
      email: signup.email,
      businessId: signup.businessId,
      plan: membershipTierForChoice(signup.choice),
      phone: signup.phone,
    });
  } catch (error) {
    await reportServerError(error, { app: "platform", operation: "server_action", route: "/join", userId: signup.userId });
  }
}
