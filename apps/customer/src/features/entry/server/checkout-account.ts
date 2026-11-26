import "server-only";
import { randomBytes } from "node:crypto";
import { AccountAlreadyExistsError, createPendingPasswordAccountWithGrant } from "@brandbasket/auth";
import {
  createUnlistedAccountBusiness,
  findUserByEmail,
  isPhoneAccountEmail,
  saveBillingProfile,
  setUserPhoneNumber,
  UserAlreadyHasBusinessError,
  type NewSignupAttribution,
} from "@brandbasket/db";
import { currencyForCountry } from "@brandbasket/shared/lib/pricing";
import { parsePhoneEntry } from "@brandbasket/shared/lib/validation/phone";
import { headers } from "next/headers";
import { reportSignUpToAds } from "@/features/conversions/server";
import { getAuth } from "@/lib/auth";
import { getStaffDb } from "@/lib/db";
import type { CheckoutField, CheckoutSignupInput } from "../rules/checkout-form";
import { recordAccountTermsConsent } from "./account-consent";
import { signInCustomer } from "./customer-sign-in";
import { recordAttributionForSignup, recordLeadForSignup } from "./listing-account";

/*
 * The account a visitor gets by paying first (plan 64). There is no email code and no password: the account is made with a
 * random one nobody sees, marked pending, and the owner sets their own through the link in the payment email, which also
 * proves the address. The visitor is signed in at once so the payment can start. Staff connection on a public action, like
 * the other sign-ups: nothing here reads or changes anything that exists, and the action rate limits per network first.
 */

const PHONE_MISSING_MESSAGE = "Enter your mobile number.";
const INVALID_EMAIL_MESSAGE = "Enter a valid email address.";

export type CheckoutAccountOutcome =
  | { readonly kind: "created"; readonly userId: string; readonly businessId: string | null }
  /** The address already has an account: the screen offers Sign in and Forgot password. Nothing was created. */
  | { readonly kind: "exists" }
  | { readonly kind: "refused"; readonly field: CheckoutField; readonly message: string };

/** A password nobody sees, meeting the policy: 24 random characters, then a letter, a number and a symbol to be sure. */
export function generateAccountPassword(): string {
  return `${randomBytes(18).toString("base64url")}-a9`;
}

/**
 * Opens the account, its business (a `listing` business held on `/checkout` until it pays: signup_choice managed), the
 * consent proof, the lead, the attribution and, with a GSTIN, the billing profile, then signs the visitor in. Without a
 * GSTIN no profile is saved: the invoice is made out to the business name and the state saved here (plan 64, 3.3).
 * A mobile number already on another account is not refused: nothing proves either holder, and refusing would let anyone
 * block a real customer's number. It is saved only when free.
 */
export async function createCheckoutAccount(input: CheckoutSignupInput, attribution: NewSignupAttribution | null): Promise<CheckoutAccountOutcome> {
  if (isPhoneAccountEmail(input.email)) return { kind: "refused", field: "email", message: INVALID_EMAIL_MESSAGE };
  const phone = parsePhoneEntry(input.phone, PHONE_MISSING_MESSAGE);
  if (!phone.success) return { kind: "refused", field: "phone", message: phone.message };
  if (phone.e164 === null) return { kind: "refused", field: "phone", message: PHONE_MISSING_MESSAGE };

  const db = getStaffDb();
  if ((await findUserByEmail(db, input.email)) !== null) return { kind: "exists" };

  const password = generateAccountPassword();
  let userId: string;
  let signInAddress: string;
  try {
    const created = await createPendingPasswordAccountWithGrant(getAuth(), db, { email: input.email, name: input.name, password });
    userId = created.userId;
    signInAddress = created.email;
  } catch (error) {
    if (error instanceof AccountAlreadyExistsError) return { kind: "exists" };
    throw error;
  }

  await setUserPhoneNumber(db, userId, phone.e164);
  // Proof of what the owner agreed to: written as soon as the account exists, so a later failure does not lose it.
  await recordAccountTermsConsent(db, userId);

  let businessId: string | null = null;
  try {
    const created = await createUnlistedAccountBusiness(db, {
      userId,
      businessName: input.businessName,
      signupChoice: "managed",
      countryCode: input.country,
      stateCode: input.stateCode,
      currency: currencyForCountry(input.country),
    });
    businessId = created.businessId;
    if (input.gstinDetails !== null) await saveBillingProfile(db, { businessId, ...input.gstinDetails });
    await recordLeadForSignup({ name: input.name, businessName: input.businessName, email: signInAddress, businessId, choice: "managed", phone: phone.e164 });
    if (attribution !== null) {
      await recordAttributionForSignup(businessId, attribution);
      void reportSignUpToAds(attribution);
    }
  } catch (error) {
    // A brand-new account cannot already have a business; if it somehow does, signing in shows it.
    if (!(error instanceof UserAlreadyHasBusinessError)) throw error;
  }

  await signInCustomer({ email: signInAddress, password }, await headers());
  return { kind: "created", userId, businessId };
}
