import "server-only";
import { isValidGstin, normaliseGstin, stateCodeOfGstin } from "@brandbasket/billing/gstin";
import type { BillingCurrency, BillingInterval, ReferralCode } from "@brandbasket/db";
import { PLAN_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { isPrintableOnInvoice, normaliseInvoiceText } from "@brandbasket/shared/lib/billing/invoice-text";
import { isWebsiteKind, type WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { HOME_COUNTRY, isCountryCode } from "@brandbasket/shared/lib/countries";
import { isIndiaStateCode } from "@brandbasket/shared/lib/directory/india-states";
import { formatMoney, parseMoney } from "@brandbasket/shared/lib/money";
import { optionalEmail } from "@brandbasket/shared/lib/validation/contact";
import { parsePhoneEntry, supportedCountryOf } from "@brandbasket/shared/lib/validation/phone";
import { cleanLine } from "@brandbasket/shared/lib/validation/text";
import { z } from "zod";
import { CUSTOM_PRICE_FIELDS, LINK_SERVICE_IDS, NOTE_MAX_LENGTH, readBuildDiscount, readCustomPrice, readDealAdvance } from "./payment-link-summary";

/**
 * The create form of a payment link (plan 65, task E1; deal types and custom prices, plan 66), read on the server. Staff choose a free
 * or a paid deal, the services, and type the paid deal's build price, discount and advance and any custom recurring prices; every
 * figure that follows is worked out by the shared billing rules. What the form allowed is checked again here, because the form is a
 * courtesy and this is the control.
 */

export const PAYMENT_LINK_FIELDS = [
  "countryCode",
  "service",
  "websiteKind",
  "billingInterval",
  "dealType",
  "buildPrice",
  "discountKind",
  "discountValue",
  "setupFeeNote",
  "advanceKind",
  "advanceValue",
  "websitePrice",
  "socialPrice",
  "adsPrice",
  "monitoringPrice",
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
  /** A free deal has no build price; a paid deal has the finalised one. */
  readonly dealType: "free" | "paid";
  /** The finalised build price (before the discount), paid deals only. */
  readonly setupFeeListCents: number | null;
  readonly setupFeeDiscountCents: number | null;
  readonly setupFeeNote: string | null;
  /** Paid deals only: what the customer pays first, 1 to the net build price. */
  readonly advanceCents: number | null;
  /** Custom recurring prices for the billing period, minor units, GST included. Null is the list price. */
  readonly websitePriceCents: number | null;
  readonly socialPriceCents: number | null;
  readonly adsPriceCents: number | null;
  readonly monitoringPriceCents: number | null;
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
  dealType: z.enum(["free", "paid"], { error: "Choose a free or a paid website deal." }),
  buildPrice: z.string().trim(),
  // Read only for a paid deal, so a free deal's form (which does not send it) is not refused for it.
  discountKind: z.string().trim(),
  discountValue: z.string().trim(),
  setupFeeNote: text(NOTE_MAX_LENGTH, `The note is at most ${NOTE_MAX_LENGTH} characters.`),
  advanceKind: z.string().trim(),
  advanceValue: z.string().trim(),
  websitePrice: z.string().trim(),
  socialPrice: z.string().trim(),
  adsPrice: z.string().trim(),
  monitoringPrice: z.string().trim(),
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

interface PaidBuild {
  readonly listCents: number;
  readonly discountCents: number;
  readonly advanceCents: number;
  readonly note: string | null;
}

const DISCOUNT_KINDS = ["none", "amount", "percent", "final"] as const;
/** The finalised price is typed in rupees or dollars; the database column is a 32-bit integer of minor units. */
const BUILD_PRICE_MAX_CENTS = 2_000_000_000;

function readPaidBuild(raw: z.infer<typeof rawForm>, currency: BillingCurrency, kind: WebsiteKind): { readonly build: PaidBuild } | Refused {
  const listCents = parseMoney(raw.buildPrice);
  if (listCents === null) return refuse("buildPrice", "Type the build price as a number like 35000 or 35000.50.");
  if (listCents < 100 || listCents > BUILD_PRICE_MAX_CENTS) return refuse("buildPrice", "The build price is at least 1 and under 20,000,000.");

  const discountKind = DISCOUNT_KINDS.find((candidate) => candidate === raw.discountKind);
  if (discountKind === undefined) return refuse("discountKind", "Choose how the build price is discounted.");
  const read = readBuildDiscount(discountKind, raw.discountValue, listCents);
  if (!read.ok) {
    if (read.reason === "unreadable") {
      return refuse("discountValue", discountKind === "percent" ? "Type the percentage as a number like 20 or 12.5." : "Type the amount as a number like 5000 or 12.50.");
    }
    return refuse("discountValue", discountKind === "percent" ? "The percentage cannot be more than 100." : `That is more than the build price of ${formatMoney(listCents, currency)}.`);
  }
  const discountCents = read.cents;
  if (discountCents === listCents) return refuse("discountValue", "A fully waived build is a free deal. Choose free instead.");

  let note: string | null = null;
  if (discountCents > 0) {
    if (raw.setupFeeNote === "") return refuse("setupFeeNote", "Add a note for the discount. The customer and the invoice read it.");
    const plain = printable(raw.setupFeeNote, "setupFeeNote", "Write the note in plain English letters and digits: it prints on the invoice.");
    if (isRefusal(plain)) return plain;
    if (plain.value.length < 1 || plain.value.length > NOTE_MAX_LENGTH) return refuse("setupFeeNote", `The note is 1 to ${NOTE_MAX_LENGTH} characters.`);
    note = plain.value;
  }

  const advanceKind = raw.advanceKind === "amount" || raw.advanceKind === "percent" ? raw.advanceKind : null;
  if (advanceKind === null) return refuse("advanceKind", "Choose whether the advance is an amount or a percentage.");
  const advance = readDealAdvance(advanceKind, raw.advanceValue, { currency, kind, listCents, discountCents });
  if (!advance.ok) {
    if (advance.reason === "unreadable") {
      return refuse("advanceValue", advanceKind === "percent" ? "Type the advance as a percentage like 30 or 12.5." : "Type the advance as a number like 10000 or 10000.50.");
    }
    return refuse("advanceValue", `The advance is from 1 to the net build price of ${formatMoney(listCents - discountCents, currency)}.`);
  }
  return { build: { listCents, discountCents, advanceCents: advance.amounts.advanceCents, note } };
}

type CustomPriceCents = Pick<PaymentLinkDraft, "websitePriceCents" | "socialPriceCents" | "adsPriceCents" | "monitoringPriceCents">;

const PRICE_COLUMNS = {
  "managed-website": "websitePriceCents",
  "social-media": "socialPriceCents",
  "paid-ads": "adsPriceCents",
  "expert-monitoring": "monitoringPriceCents",
} as const satisfies Record<MonthlyAddOnId, keyof CustomPriceCents>;

/** The custom recurring prices typed, as minor units for the link's period; blank is null. A price needs its service in the basket. */
function readCustomPrices(raw: z.infer<typeof rawForm>, services: readonly MonthlyAddOnId[]): { readonly prices: CustomPriceCents } | Refused {
  const prices: CustomPriceCents = { websitePriceCents: null, socialPriceCents: null, adsPriceCents: null, monitoringPriceCents: null };
  const cents: Record<keyof CustomPriceCents, number | null> = { ...prices };
  for (const id of LINK_SERVICE_IDS) {
    const name = CUSTOM_PRICE_FIELDS[id];
    const read = readCustomPrice(raw[name]);
    if (!read.ok) return refuse(name, "Type the price as a whole number of rupees or dollars, like 1999. Leave it blank for the list price.");
    if (read.cents !== null && !services.includes(id)) return refuse(name, "That service is not on this link. Clear the price or choose the service.");
    cents[PRICE_COLUMNS[id]] = read.cents;
  }
  return { prices: cents };
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

  let websiteKind: WebsiteKind | null = null;
  if (services.includes("managed-website")) {
    if (!isWebsiteKind(raw.websiteKind)) return refuse("websiteKind", "Choose the kind of website: B2B or ecommerce.");
    websiteKind = raw.websiteKind;
  }

  let build: PaidBuild | null = null;
  if (raw.dealType === "paid") {
    if (websiteKind === null) return refuse("service", "A paid deal needs Website Management. Choose it, or make this a free deal.");
    const read = readPaidBuild(raw, currency, websiteKind);
    if (isRefusal(read)) return read;
    build = read.build;
  }

  const custom = readCustomPrices(raw, services);
  if (isRefusal(custom)) return custom;

  if (raw.couponId !== "" && !COUPON_ID.safeParse(raw.couponId).success) return refuse("couponId", "Choose a coupon from the list.");
  // A coupon or custom prices, never both (plan 66, O6): say it on the first price typed.
  if (raw.couponId !== "") {
    const typed = LINK_SERVICE_IDS.find((id) => custom.prices[PRICE_COLUMNS[id]] !== null);
    if (typed !== undefined) return refuse(CUSTOM_PRICE_FIELDS[typed], "A link takes a coupon or custom prices, not both. Clear this price or the coupon.");
  }
  // Conservative until plan 66 step 5 re-verifies it: the first-payment rule refuses a code on a yearly deal that has a build.
  if (raw.couponId !== "" && raw.billingInterval === "year" && build !== null) {
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
      websiteKind,
      dealType: raw.dealType,
      setupFeeListCents: build?.listCents ?? null,
      setupFeeDiscountCents: build?.discountCents ?? null,
      setupFeeNote: build?.note ?? null,
      advanceCents: build?.advanceCents ?? null,
      ...custom.prices,
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
