import { pgEnum } from "drizzle-orm/pg-core";

/**
 * What the customer is charged in. India is billed in INR; every other country in USD. Staff set it when they send
 * the setup link, and it is never guessed from an IP address at charge time.
 *
 * It lives in its own module because both `leads` and `businesses` carry it, and declaring it in either one would
 * make those two modules import each other.
 */
export const billingCurrency = pgEnum("billing_currency", ["USD", "INR"]);
export type BillingCurrency = (typeof billingCurrency.enumValues)[number];
