import "server-only";
import { isValidGstin, normaliseGstin, stateCodeOfGstin } from "@brandbasket/billing/gstin";
import type { BillingCurrency, BillingInterval, ReferralCode } from "@brandbasket/db";
import { PLAN_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { isPrintableOnInvoice, normaliseInvoiceText } from "@brandbasket/shared/lib/billing/invoice-text";
import { isWebsiteKind, type WebsiteKind, websiteBuildFeeCents } from "@brandbasket/shared/lib/billing/website-kind";
import { HOME_COUNTRY, isCountryCode } from "@brandbasket/shared/lib/countries";
import { isIndiaStateCode } from "@brandbasket/shared/lib/directory/india-states";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { optionalEmail } from "@brandbasket/shared/lib/validation/contact";
import { parsePhoneEntry, supportedCountryOf } from "@brandbasket/shared/lib/validation/phone";
import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { z } from "zod";
import { LINK_SERVICE_IDS, NOTE_MAX_LENGTH, readBuildDiscount } from "./payment-link-summary";

/**
 * The create form of a payment link (plan 65, task E1), read on the server. The money is never typed: staff choose services, a
 * website kind and how the build fee is discounted, and every figure is worked out from those by the shared billing rules. What
 * the form allowed is checked again here, because the form is a courtesy and this is the control.
 */

export const PAYMENT_LINK_FIELDS = [
  "countryCode",
  "service",
  "websiteKind",
  "billingInterval",
  "discountKind",
  "discountValue",
  "setupFeeNote",
  "couponId",
  "contactName",
  "businessName",
  "email",
  "phoneCountry",
  "phone",
  "stateCode",
  "gstin",
  "legalName",
  "addressLine1",
  "addressLine2",
  "city",
  "postalCode",
] as const;
export type PaymentLinkField = (typeof PAYMENT_LINK_FIELDS)[number];

/** Where the customer's details go: all optional, none of them a deal term. */
export interface PaymentLinkCustomer {
  readonly contactName: string | null;
  readonly businessName: string | null;
  readonly email: string | null;
  readonly phoneCountry: string | null;
  readonly phone: string | null;
  readonly stateCode: string | null;
  readonly gstin: string | null;
  readonly legalName: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly postalCode: string | null;
}

export interface PaymentLinkDraft {
  /** ISO 3166-1 alpha-2, upper case. */
  readonly countryCode: string;
  /** India is rupees, anything else dollars (D12). */
  readonly currency: BillingCurrency;
  readonly services: readonly MonthlyAddOnId[];
  readonly billingInterval: BillingInterval;
  /** Set exactly when the basket holds Website Management. */
  readonly websiteKind: WebsiteKind | null;
  readonly setupFeeListCents: number | null;
  readonly setupFeeDiscountCents: number | null;
  readonly setupFeeNote: string | null;
  readonly couponId: string | null;
  readonly customer: PaymentLinkCustomer;
}

export type ParsedPaymentLinkForm =
  | { readonly ok: true; readonly draft: PaymentLinkDraft }
  | { readonly ok: false; readonly field: PaymentLinkField | null; readonly message: string };

type Refused = Extract<ParsedPaymentLinkForm, { readonly ok: false }>;

const refuse = (field: PaymentLinkField | null, message: string): Refused => ({ ok: false, field, message });

const text = (max: number, message: string) => z.string().transform((value) => cleanLine(value).replace(/\s+/g, " ")).pipe(z.string().max(max, message));

/** The shape of what was typed, before any rule about what it means. */
const rawForm = z.object({
  countryCode: z.string().trim().toUpperCase(),
  service: z.array(z.string()),
  websiteKind: z.string().trim(),
  billingInterval: z.enum(["month", "year"], { error: "Choose monthly or yearly." }),
  discountKind: z.enum(["none", "amount", "percent", "final"], { error: "Choose how the build fee is discounted." }),
  discountValue: z.string().trim(),
  setupFeeNote: text(NOTE_MAX_LENGTH, `The note is at most ${NOTE_MAX_LENGTH} characters.`),
  couponId: z.string().trim(),
  contactName: text(100, "That name is too long."),
  businessName: text(150, "That business name is too long."),
  email: z.string(),
  phoneCountry: z.string().trim(),
  phone: z.string(),
  stateCode: z.string().trim(),
  gstin: z.string(),
  legalName: text(200, "That name is too long."),
  addressLine1: text(200, "Keep this line under 200 characters."),
  addressLine2: text(200, "Keep this line under 200 characters."),
  city: text(100, "Keep the city under 100 characters."),
  postalCode: z.string().trim().max(20, "That pincode is too long."),
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const blankToNull = (value: string): string | null => (value === "" ? null : value);
const PINCODE = /^[1-9][0-9]{5}$/;
const COUPON_ID = z.uuid();

/** Text that prints on an invoice: typographic punctuation made plain, and refused when anything but printable ASCII is left. */
function printable(value: string, name: PaymentLinkField, message: string): { readonly value: string } | Refused {
  const plain = normaliseInvoiceText(value);
  return isPrintableOnInvoice(plain) ? { value: plain } : refuse(name, message);
}

function isRefusal(value: object): value is Refused {
  return "ok" in value;
}

function readServices(chosen: readonly string[]): { readonly services: MonthlyAddOnId[] } | Refused {
  const unique = new Set(chosen);
  const services = LINK_SERVICE_IDS.filter((id) => unique.has(id));
  if (services.length !== unique.size) return refuse("service", "One of those services is not on sale.");
  if (services.length === 0) return refuse("service", "Choose at least one service.");
  if (!services.some((id) => (PLAN_ADD_ON_IDS as readonly string[]).includes(id))) return refuse("service", "Dedicated Expert Monitoring needs at least one plan beside it.");
  return { services };
}

interface BuildFee {
  readonly kind: WebsiteKind;
  readonly listCents: number;
  readonly discountCents: number;
  readonly note: string | null;
}

function readBuildFee(raw: z.infer<typeof rawForm>, currency: BillingCurrency): { readonly fee: BuildFee } | Refused {
  if (!isWebsiteKind(raw.websiteKind)) return refuse("websiteKind", "Choose the kind of website: B2B or ecommerce.");
  const listCents = websiteBuildFeeCents(raw.websiteKind, currency);
  const read = readBuildDiscount(raw.discountKind, raw.discountValue, listCents);
  if (!read.ok) {
    if (read.reason === "unreadable") {
      return refuse("discountValue", raw.discountKind === "percent" ? "Type the percentage as a number like 20 or 12.5." : "Type the amount as a number like 5000 or 12.50.");
    }
    return refuse("discountValue", raw.discountKind === "percent" ? "The percentage cannot be more than 100." : `That is more than the build fee of ${formatMoney(listCents, currency)}.`);
  }
  const discountCents = read.cents;
  const note = raw.setupFeeNote;
  if (discountCents > 0) {
    if (note === "") return refuse("setupFeeNote", "Add a note for the discount. The customer and the invoice read it.");
    const plain = printable(note, "setupFeeNote", "Write the note in plain English letters and digits: it prints on the invoice.");
    if (isRefusal(plain)) return plain;
    if (plain.value.length < 1 || plain.value.length > NOTE_MAX_LENGTH) return refuse("setupFeeNote", `The note is 1 to ${NOTE_MAX_LENGTH} characters.`);
    return { fee: { kind: raw.websiteKind, listCents, discountCents, note: plain.value } };
  }
  return { fee: { kind: raw.websiteKind, listCents, discountCents: 0, note: null } };
}

function readCustomer(raw: z.infer<typeof rawForm>, countryCode: string, currency: BillingCurrency): { readonly customer: PaymentLinkCustomer } | Refused {
  const inIndia = countryCode === HOME_COUNTRY;

  let businessName: string | null = blankToNull(raw.businessName);
  if (businessName !== null && currency === "INR") {
    const plain = printable(businessName, "businessName", "The business name cannot be printed on an invoice. Use English letters.");
    if (isRefusal(plain)) return plain;
    businessName = plain.value;
  }

  const email = optionalEmail.safeParse(raw.email);
  if (!email.success) return refuse("email", email.error.issues[0]?.message ?? "Enter a valid email address.");

  // A number without a "+" is read in the link's own country unless the form said otherwise.
  const phoneCountryTyped = raw.phoneCountry === "" ? countryCode : raw.phoneCountry;
  const phone = parsePhoneEntry({ country: phoneCountryTyped, number: raw.phone }, null);
  if (!phone.success) return refuse(phone.part === "country" ? "phoneCountry" : "phone", phone.message);
  const typedPhone = cleanLine(raw.phone);
  const hasPhone = typedPhone !== "";
  // The number is kept as it was typed with its country, the shape the sign-up form sends; an international "+" number needs no country.
  const phoneCountry = hasPhone ? supportedCountryOf(cleanLine(phoneCountryTyped)) : null;

  let stateCode: string | null = null;
  let gstin: string | null = null;
  let legalName: string | null = null;
  if (inIndia) {
    if (raw.stateCode !== "") {
      if (!isIndiaStateCode(raw.stateCode)) return refuse("stateCode", "Choose a state from the list.");
      stateCode = raw.stateCode;
    }
    const typedGstin = normaliseGstin(raw.gstin);
    if (typedGstin !== "") {
      if (!isValidGstin(typedGstin)) return refuse("gstin", "This GSTIN is not valid.");
      gstin = typedGstin;
      // A GSTIN fixes the state: the customer's form takes it from there, so a different state here would only conflict.
      stateCode = stateCodeOfGstin(typedGstin);
      if (raw.legalName === "") return refuse("legalName", "Add the name as on the GST registration.");
      const plain = printable(raw.legalName, "legalName", "Write the name in English letters: it prints on the invoice.");
      if (isRefusal(plain)) return plain;
      legalName = plain.value;
    }
  }

  const addressLine1 = blankToNull(raw.addressLine1);
  const addressLine2 = blankToNull(raw.addressLine2);
  const city = blankToNull(raw.city);
  const postalCode = blankToNull(raw.postalCode.replace(/\s/g, ""));
  for (const [name, value] of [["addressLine1", addressLine1], ["addressLine2", addressLine2], ["city", city]] as const) {
    if (value === null) continue;
    const plain = printable(value, name, "Write this in English letters: it prints on the invoice.");
    if (isRefusal(plain)) return plain;
  }
  if (postalCode !== null && inIndia && !PINCODE.test(postalCode)) return refuse("postalCode", "Enter a 6 digit pincode.");

  return {
    customer: {
      contactName: blankToNull(raw.contactName),
      businessName,
      email: email.data,
      phoneCountry,
      phone: hasPhone ? typedPhone : null,
      stateCode,
      gstin,
      legalName,
      addressLine1: addressLine1 === null ? null : normaliseInvoiceText(addressLine1),
      addressLine2: addressLine2 === null ? null : normaliseInvoiceText(addressLine2),
      city: city === null ? null : normaliseInvoiceText(city),
      postalCode,
    },
  };
}

export function parsePaymentLinkForm(formData: FormData): ParsedPaymentLinkForm {
  const input: Record<string, unknown> = { service: formData.getAll("service").filter((value): value is string => typeof value === "string") };
  for (const name of PAYMENT_LINK_FIELDS) if (name !== "service") input[name] = field(formData, name);
  const shaped = rawForm.safeParse(input);
  if (!shaped.success) {
    const issue = shaped.error.issues[0];
    const name = issue?.path[0];
    return refuse(PAYMENT_LINK_FIELDS.find((candidate) => candidate === name) ?? null, issue?.message ?? "Check the form and try again.");
  }
  const raw = shaped.data;

  if (!isCountryCode(raw.countryCode)) return refuse("countryCode", "Choose the customer's country.");
  const currency: BillingCurrency = raw.countryCode === HOME_COUNTRY ? "INR" : "USD";

  const chosen = readServices(raw.service);
  if (isRefusal(chosen)) return chosen;
  const { services } = chosen;

  let fee: BuildFee | null = null;
  if (services.includes("managed-website")) {
    const read = readBuildFee(raw, currency);
    if (isRefusal(read)) return read;
    fee = read.fee;
  }

  if (raw.couponId !== "" && !COUPON_ID.safeParse(raw.couponId).success) return refuse("couponId", "Choose a coupon from the list.");
  // The first-payment rule refuses a code on a yearly deal that carries a build fee; say so here rather than at the pay screen.
  if (raw.couponId !== "" && raw.billingInterval === "year" && fee !== null && fee.listCents > fee.discountCents) {
    return refuse("couponId", "A coupon cannot go on a yearly link that has a build fee. Take the discount off the build fee instead, or choose monthly.");
  }

  const customer = readCustomer(raw, raw.countryCode, currency);
  if (isRefusal(customer)) return customer;

  return {
    ok: true,
    draft: {
      countryCode: raw.countryCode,
      currency,
      services,
      billingInterval: raw.billingInterval,
      websiteKind: fee?.kind ?? null,
      setupFeeListCents: fee?.listCents ?? null,
      setupFeeDiscountCents: fee?.discountCents ?? null,
      setupFeeNote: fee?.note ?? null,
      couponId: blankToNull(raw.couponId),
      customer: customer.customer,
    },
  };
}

/** Why a coupon cannot go on a link, or null when it can: a coupon (no affiliate), on, in the link's currency, not expired. */
export function couponProblem(code: Pick<ReferralCode, "affiliateId" | "active" | "currency" | "expiresAt">, currency: BillingCurrency, now: Date): string | null {
  if (code.affiliateId !== null) return "That is an affiliate's code, not a coupon.";
  if (!code.active) return "That coupon is turned off.";
  if (code.currency !== currency) return `That coupon is in ${code.currency}, and this link is in ${currency}.`;
  if (code.expiresAt !== null && code.expiresAt <= now) return "That coupon has expired.";
  return null;
}
