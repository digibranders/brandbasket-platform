/*
 * The vocabulary of the Business profile's sections beyond Details (the owner's spec sheet): the contact buttons, the
 * payment methods, the product availabilities and the limits their forms share with the database
 * (packages/db/src/schema/directory-business-profiles.ts and directory-business-catalog.ts). Browser-safe: the forms
 * and the parsers both read it. The values are the database's own; the words are the owner's.
 */

export const CONTACT_OPTIONS = ["call", "whatsapp", "enquiry", "appointment", "booking", "quote", "directions", "website"] as const;
export type ContactOption = (typeof CONTACT_OPTIONS)[number];

export const CONTACT_OPTION_LABELS: Readonly<Record<ContactOption, string>> = {
  call: "Call",
  whatsapp: "WhatsApp",
  enquiry: "Enquiry",
  appointment: "Appointment",
  booking: "Booking",
  quote: "Request a quote",
  directions: "Get directions",
  website: "Visit website",
};

/** What each button needs from the business before it can work, in a few words; null when it needs nothing. */
export const CONTACT_OPTION_NEEDS: Readonly<Record<ContactOption, string | null>> = {
  call: null,
  whatsapp: "Needs a WhatsApp number in Identity.",
  enquiry: null,
  appointment: null,
  booking: null,
  quote: null,
  directions: "Needs a Google Maps link in Identity.",
  website: "Needs a website in Identity.",
};

export const PAYMENT_METHODS = ["cash", "upi", "card", "net_banking", "cheque", "emi"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  cash: "Cash",
  upi: "UPI",
  card: "Debit / credit card",
  net_banking: "Net banking",
  cheque: "Cheque",
  emi: "EMI",
};

export const PRODUCT_AVAILABILITIES = ["in_stock", "out_of_stock", "made_to_order"] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

export const PRODUCT_AVAILABILITY_LABELS: Readonly<Record<ProductAvailability, string>> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  made_to_order: "Made to order",
};

export const CATALOG_MAX_ITEMS = 40;
export const ITEM_NAME_MAX_LENGTH = 80;
export const ITEM_DESCRIPTION_MAX_LENGTH = 300;
/** A service's long description (the popup) and the one line under its name (the list); added 2026-10-10. */
export const SERVICE_DESCRIPTION_MAX_LENGTH = 2000;
export const SERVICE_SUMMARY_MAX_LENGTH = 120;
export const ITEM_CATEGORY_MAX_LENGTH = 60;
/** Services are no longer grouped; the database and the feed still want a group for each, so every service gets this one. */
export const SERVICE_DEFAULT_CATEGORY = "Services";
export const ITEM_AREA_MAX_LENGTH = 120;
export const ITEM_PRICE_MAX_INR = 10_000_000;
/** The FAQ tab: the most questions, and the longest question and answer. */
export const FAQ_MAX_ITEMS = 20;
export const FAQ_QUESTION_MAX_LENGTH = 150;
export const FAQ_ANSWER_MAX_LENGTH = 600;
export const LICENCES_MAX = 10;
export const LICENCE_MAX_LENGTH = 100;

/** Identity's shorter texts. */
export const SERVICE_AREA_MAX_LENGTH = 200;
export const DIRECTIONS_NOTE_MAX_LENGTH = 200;
export const HOLIDAY_HOURS_MAX_LENGTH = 200;
export const EMAIL_MAX_LENGTH = 120;
/** The earliest founding year taken. */
export const ESTABLISHED_YEAR_MIN = 1800;

/** The value a "yes" box posts. */
export const YES_VALUE = "yes";
