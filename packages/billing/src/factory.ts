import { createFakeBillingProvider } from "./fake-provider";
import type { BillingProvider } from "./provider";
import type { SupportedBillingProvider } from "./select";

export interface BillingProviderSecrets {
  /** The app's auth secret. The fake provider keys its confirmation token with it. */
  readonly authSecret: string;
}

/** Builds the provider `resolveBillingProviderName` chose. Adding Razorpay adds a case here and nowhere else. */
export function createBillingProvider(name: SupportedBillingProvider, secrets: BillingProviderSecrets): BillingProvider {
  switch (name) {
    case "fake":
      return createFakeBillingProvider({ secret: secrets.authSecret });
    case "razorpay":
      throw new Error("Razorpay billing provider is not yet implemented. Use BILLING_PROVIDER=fake for now.");
    default: {
      const unhandled: never = name;
      throw new Error(`No billing provider is implemented for ${String(unhandled)}`);
    }
  }
}
