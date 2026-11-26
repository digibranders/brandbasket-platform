import "server-only";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { currencyForCountry } from "@brandbasket/shared/lib/pricing";
import { getBillingProvider } from "@/features/checkout/server/billing";
import { buildSignupBasketTable, type SignupBasketTable } from "@/features/checkout/rules/signup-basket";

/**
 * Every service on sale in `currency`, priced as the checkout will price it, with the first-month offer (plan 63) a business that
 * has had nothing is owed through the billing provider that will take the payment. The one source of the one-screen checkout's
 * figures for a signed-in unpaid sign-up (its own currency, never the visitor's header).
 */
export function loadSignupCheckoutBasketFor(currency: MoneyCurrency): SignupBasketTable {
  return buildSignupBasketTable(currency, getBillingProvider().name);
}

/** The same for a visitor in `country`: rupees in India, dollars elsewhere (the rule the website's prices follow, plan 64 D6). */
export function loadSignupCheckoutBasket(country: string): SignupBasketTable {
  return loadSignupCheckoutBasketFor(currencyForCountry(country));
}
