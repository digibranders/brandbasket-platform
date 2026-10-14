import "server-only";
import { AccountAlreadyExistsError, createPhoneAccountWithGrant, createVerifiedEmailAccountWithGrant } from "@fynix/auth";
import {
  consumeRateLimit,
  createListingAccountBusiness,
  createUnlistedAccountBusiness,
  findClaimablePlace,
  findUserByEmail,
  findUserByPhone,
  isPhoneAccountEmail,
  marketOfListing,
  PlaceNotClaimableError,
  type PlaceClaimRefusal,
  UserAlreadyHasBusinessError,
} from "@fynix/db";
import { headers } from "next/headers";
import { clientIpFrom } from "@fynix/shared/lib/client-ip";
import { isDirectoryArea, isDirectoryCategory } from "@fynix/shared/lib/directory/places";
import { retryMessage } from "@fynix/shared/lib/sign-in-limits";
import { parsePhoneEntry } from "@fynix/shared/lib/validation/phone";
import type { JoinClaimBusiness, JoinCodeStep, JoinInput } from "@/lib/join-form";
import { recordAccountTermsConsent } from "./account-consent";
import { confirmAccountEmailCode, requestAccountEmailCode, type AccountEmailCodeLimited } from "./account-email-code";
import { confirmAccountOtp, requestAccountOtp, type AccountOtpLimited } from "./account-otp";
import { getAuth } from "./auth";
import { hasValidClaimSignature } from "./claim-link";
import { ipRateLimitKey } from "./ip-key";
import { getStaffDb } from "./db";
import { signInCustomer } from "./customer-sign-in";

/*
 * The free listing sign-up (docs/superpowers/specs/2026-09-30-directory-ads-auction-design.md): a business owner who
 * found their business on the local directory opens an account to claim it and advertise. It creates the account, a
 * `listing` business with its pending claim, and signs them in. Staff then call the number to confirm the claim.
 *
 * A claim link names the business by its listing key or by its permanent place id (lib/directory-api.ts, "A claim
 * link"); either way the website signed it, and an id's place must be claimable (findClaimablePlace in @fynix/db).
 *
 * An owner whose business is not in the directory signs up with no listing (docs/superpowers/specs/2026-09-30-add-my-
 * business-design.md): the account and its business are created with no claim, and the owner adds the business on the
 * Business profile (lib/server/business-profile.ts), whose Listing tab makes the claim from the area and category they pick.
 *
 * The account is opened with a mobile number and a password, in two steps (docs/superpowers/specs/2026-09-30-phone-
 * sign-in-design.md): requestJoinCode texts the number a code, and createListingAccount opens the account only once
 * that code is confirmed. Nothing about the owner is stored between the two: the form sends its fields again.
 *
 * Under Fynix (lib/brand.ts signUpWith) the account is opened with an email address instead, in the same two steps: the
 * code is emailed (./account-email-code.ts), the account is created with the address already verified, and it has no
 * mobile number at all. Such an account cannot claim a directory listing (a claim is proven by a call to the listing's
 * number), which Fynix does not sell.
 *
 * The staff connection on an unauthenticated page, like the setup link (lib/server/setup.ts): the person has no
 * account yet, so there is no row-level security scope to write under. What keeps it safe: nothing here reads or
 * changes anything that already exists (a new account, a new business, a new claim), and every attempt is rate
 * limited per network before any work is done.
 */

const JOIN_ATTEMPTS_PER_HOUR = 5;
const ONE_HOUR_SECONDS = 60 * 60;
/**
 * How many times an hour one network may ask the sign-up to text a code. The answer says whether the number already
 * has an account, so this is what stops the form being used to look numbers up.
 */
const JOIN_CODE_REQUESTS_PER_HOUR = 10;
/** Most owners are in India, so a number without a country code is read as Indian. */
const DEFAULT_PHONE_COUNTRY = "IN";

const OWN_PHONE_MESSAGE = "Enter your mobile number.";
const ALREADY_HAS_ACCOUNT_MESSAGE = "This number already has an account. Sign in instead.";
const EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE = "This email already has an account. Sign in instead.";
const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";
const NO_EMAIL_CLAIM_MESSAGE = "A listing is claimed with the business's mobile number. Create your account with a number instead.";
const UNKNOWN_LISTING_MESSAGE = "We couldn't find that business. Open this page again from the business's listing.";
const PLACE_OWNED_MESSAGE = "This business already has an owner. If it's yours, email us and we'll sort it out.";
const PLACE_NO_ADDRESS_MESSAGE = "We can't take a claim for this business yet. Email us and we'll sort it out.";

/** What the form says of a place that cannot be claimed. An unknown place is answered as an unsigned link is: no more. */
const PLACE_REFUSAL_MESSAGES: Readonly<Record<PlaceClaimRefusal, string>> = {
  "unknown-place": UNKNOWN_LISTING_MESSAGE,
  "has-client-listing": PLACE_OWNED_MESSAGE,
  "not-open-data": PLACE_OWNED_MESSAGE,
  "already-claimed": PLACE_OWNED_MESSAGE,
  "no-address": PLACE_NO_ADDRESS_MESSAGE,
};

/** A number in E.164, or the message for the form; `missingMessage` is what an empty or unusable one is answered with. */
function parseIndianPhone(
  typed: string,
  missingMessage: string,
): { readonly ok: true; readonly e164: string } | { readonly ok: false; readonly message: string } {
  const phone = parsePhoneEntry({ country: DEFAULT_PHONE_COUNTRY, number: typed }, missingMessage);
  if (!phone.success) return { ok: false, message: phone.message };
  if (phone.e164 === null) return { ok: false, message: missingMessage };
  return { ok: true, e164: phone.e164 };
}

/** The listing is one the directory could have linked from: known category, city and area. */
function isKnownListing(listingKey: string): boolean {
  const market = marketOfListing(listingKey);
  return isDirectoryCategory(market.categorySlug) && isDirectoryArea(market.citySlug, market.areaSlug);
}

/** What a claim link carries once its business is known to be a listing key or a place id: shape-checked, not trusted. */
export type ClaimLink = JoinClaimBusiness & { readonly businessName: string; readonly signature: string };

export type ClaimLinkCheck = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * The claim link's business is one the directory could have linked from and the website signed. A link by listing key
 * is checked against the directory's own categories and areas; one by permanent id is checked for its signature first
 * (so only the website's own links reach the database), then for a place that can be claimed (findClaimablePlace),
 * whose address, from which the claim's market is read, must be a listing the directory knows. Returns the form's
 * message when it is not. The listing key must already be shaped like one (LISTING_KEY_PATTERN).
 */
export async function checkClaimLink(link: ClaimLink): Promise<ClaimLinkCheck> {
  if (link.placeId === undefined) {
    const known = isKnownListing(link.listing) && hasValidClaimSignature(link.listing, link.businessName, link.signature);
    return known ? { ok: true } : { ok: false, message: UNKNOWN_LISTING_MESSAGE };
  }
  if (!hasValidClaimSignature(link.placeId, link.businessName, link.signature)) return { ok: false, message: UNKNOWN_LISTING_MESSAGE };
  const found = await findClaimablePlace(getStaffDb(), link.placeId);
  if (found.kind === "refused") return { ok: false, message: PLACE_REFUSAL_MESSAGES[found.reason] };
  // The place is real and claimable, but its address is outside the categories and areas the directory lists: ours to sort out.
  return isKnownListing(found.listingKey) ? { ok: true } : { ok: false, message: PLACE_NO_ADDRESS_MESSAGE };
}

/** How the owner is reached once the form's contact is read: a number in E.164, or an address. */
type CheckedContact = { readonly kind: "phone"; readonly phone: string } | { readonly kind: "email"; readonly email: string };

/**
 * What both steps check before anything else: a claim's link is the directory's own, and the number (or the address) is
 * one. Returns it read for use (a number in E.164), or the message for the form.
 */
async function checkJoinInput(
  input: JoinInput,
): Promise<{ readonly ok: true; readonly contact: CheckedContact } | { readonly ok: false; readonly message: string }> {
  if (input.email !== undefined) {
    if (input.kind === "claim") return { ok: false, message: NO_EMAIL_CLAIM_MESSAGE };
    // The address is one the form read, but placeholders stand for phone accounts and are never anybody's inbox.
    if (isPhoneAccountEmail(input.email)) return { ok: false, message: INVALID_EMAIL_MESSAGE };
    return { ok: true, contact: { kind: "email", email: input.email } };
  }
  if (input.kind === "claim") {
    const link = await checkClaimLink(input);
    if (!link.ok) return link;
  }
  const phone = parseIndianPhone(input.phone, OWN_PHONE_MESSAGE);
  return phone.ok ? { ok: true, contact: { kind: "phone", phone: phone.e164 } } : phone;
}

export type JoinCodeOutcome =
  | AccountOtpLimited
  | AccountEmailCodeLimited
  | { readonly kind: "code"; readonly otp: JoinCodeStep }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The first step of the sign-up: texts a code to the owner's number. Refuses, with a message for the form, a claim
 * link the directory did not sign, a number that is not one or is outside the countries we text, and a number that
 * already has an account (they are sent to sign in, and no text is spent on them). Limited per network before the
 * number is looked up, since that answer says which numbers have accounts.
 */
export async function requestJoinCode(input: JoinInput): Promise<JoinCodeOutcome> {
  const checked = await checkJoinInput(input);
  if (!checked.ok) return { kind: "refused", message: checked.message };

  const clientIp = clientIpFrom(await headers());
  // Before the number or address is looked up: what follows tells one with an account from one without.
  const budget = await consumeRateLimit(getStaffDb(), `join-code:ip:${ipRateLimitKey(clientIp)}`, {
    limit: JOIN_CODE_REQUESTS_PER_HOUR,
    windowSeconds: ONE_HOUR_SECONDS,
  });
  if (!budget.allowed) return { kind: "limited", scope: "network", retryAfterSeconds: budget.retryAfterSeconds };

  if (checked.contact.kind === "email") return requestJoinEmailCode(checked.contact.email, clientIp);

  const { phone } = checked.contact;
  if ((await findUserByPhone(getStaffDb(), phone)) !== null) return { kind: "refused", message: ALREADY_HAS_ACCOUNT_MESSAGE };

  const outcome = await requestAccountOtp({ purpose: "signup", phone, send: true }, clientIp, new Date());
  switch (outcome.kind) {
    case "sent":
      return { kind: "code", otp: { otpId: outcome.otpId, phoneHint: outcome.phoneHint, via: "phone", texted: outcome.texted } };
    case "invalid":
      return { kind: "refused", message: outcome.message };
    case "limited":
      return outcome;
    case "unavailable":
      return { kind: "refused", message: "We can't text a code right now. Please try again later." };
    case "failed":
      return { kind: "refused", message: "We couldn't text that number. Check it and try again." };
  }
}

/** The first step for an email sign-up: emails the code, unless the address already has an account. */
async function requestJoinEmailCode(email: string, clientIp: string): Promise<JoinCodeOutcome> {
  if ((await findUserByEmail(getStaffDb(), email)) !== null) return { kind: "refused", message: EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE };
  const outcome = await requestAccountEmailCode({ email }, clientIp, new Date());
  switch (outcome.kind) {
    case "sent":
      return { kind: "code", otp: { otpId: outcome.otpId, phoneHint: outcome.emailHint, via: "email", texted: outcome.confirmRequired } };
    case "limited":
      return outcome;
    case "unavailable":
      return { kind: "refused", message: "We can't email a code right now. Please try again later." };
    case "failed":
      return { kind: "refused", message: "We couldn't email that address. Check it and try again." };
  }
}

export type ListingAccountOutcome =
  | AccountOtpLimited
  | AccountEmailCodeLimited
  | { readonly kind: "created" }
  /** The code was wrong or has run out: the form stays on the code step. */
  | { readonly kind: "wrong-code"; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

/**
 * The second step: opens the free listing account for `input` once the code texted to its number is confirmed, and
 * signs its owner in. Everything the first step checked is checked again, since the form sends it again. The account
 * is created before the business, as with a setup link; if the business then fails the person can sign in and staff
 * repair it from the Ads page. A claim is made with the number just proven. A business that is not in the directory
 * yet is named after its owner until they add it on the Listing page. What the owner chose on the entry page is kept
 * on the business: an owner who chose Premium is held on the payment page until they pay (customer-access.ts).
 */
export async function createListingAccount(input: JoinInput): Promise<ListingAccountOutcome> {
  const requestHeaders = await headers();
  const clientIp = clientIpFrom(requestHeaders);
  if (input.code === null) return { kind: "refused", message: "Enter a 6-digit code." };

  const checked = await checkJoinInput(input);
  if (!checked.ok) return { kind: "refused", message: checked.message };

  const { contact } = checked;
  const confirmed =
    contact.kind === "email"
      ? await confirmAccountEmailCode({ ...input.code, email: contact.email }, clientIp, new Date())
      : await confirmAccountOtp({ ...input.code, purpose: "signup", phone: contact.phone }, clientIp, new Date());
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

  // Counted only for a proven number or address, so a wrong code never spends the network's account budget.
  const budget = await consumeRateLimit(getStaffDb(), `join:client:${ipRateLimitKey(clientIp)}`, {
    limit: JOIN_ATTEMPTS_PER_HOUR,
    windowSeconds: ONE_HOUR_SECONDS,
  });
  if (!budget.allowed) return { kind: "refused", message: retryMessage(budget.retryAfterSeconds) };

  const alreadyMessage = contact.kind === "email" ? EMAIL_ALREADY_HAS_ACCOUNT_MESSAGE : ALREADY_HAS_ACCOUNT_MESSAGE;
  let userId: string;
  let signInAddress: string;
  try {
    const created =
      contact.kind === "email"
        ? await createVerifiedEmailAccountWithGrant(getAuth(), getStaffDb(), { email: contact.email, name: input.name, password: input.password })
        : await createPhoneAccountWithGrant(getAuth(), getStaffDb(), { phone: contact.phone, name: input.name, password: input.password });
    userId = created.userId;
    signInAddress = created.email;
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) return { kind: "refused", message: alreadyMessage };
    throw error;
  }

  // Proof of what the owner agreed to: written as soon as the account exists, before the business, so a later failure
  // does not lose it.
  await recordAccountTermsConsent(getStaffDb(), userId);

  try {
    if (input.kind === "claim" && contact.kind === "phone") {
      await createListingAccountBusiness(getStaffDb(), {
        userId,
        businessName: input.businessName,
        ...(input.placeId === undefined ? { listingKey: input.listing } : { placeId: input.placeId }),
        phone: contact.phone,
        signupChoice: input.choice,
      });
    } else {
      // Named after its owner until they add it on the Listing page, unless they gave its name (a Premium sign-up).
      await createUnlistedAccountBusiness(getStaffDb(), {
        userId,
        businessName: input.businessName ?? input.name,
        signupChoice: input.choice,
      });
    }
  } catch (error) {
    if (error instanceof PlaceNotClaimableError) {
      // The place was claimed (or taken by a client) between the check and here. The account exists, so the owner
      // keeps it: the business opens with no claim, and they add it on the Listing page, as an unlisted one does.
      await createUnlistedAccountBusiness(getStaffDb(), {
        userId,
        businessName: input.businessName ?? input.name,
        signupChoice: input.choice,
      });
    } else if (!(error instanceof UserAlreadyHasBusinessError)) {
      // A brand-new account cannot already have a business; if it somehow does, signing in shows it.
      throw error;
    }
  }

  await signInCustomer({ email: signInAddress, password: input.password }, requestHeaders);
  return { kind: "created" };
}
