import type { DomainStatus, EnquiryKind, ProjectStatus } from "@brandbasket/db";

/** The free `*.brandbasket.in` address, or a domain the customer owns. */
export interface StoredDomain {
  readonly hostname: string;
  readonly status: DomainStatus;
  readonly isFreeAddress: boolean;
}

export interface AddressPanel {
  readonly hostname: string;
  /** One line under it, or null. */
  readonly line: string | null;
}

/**
 * "Your web address" while the website is not live. Their own domain is named with the promise from the mock until the preview
 * is approved; the free address is named as it is. Null without an address.
 */
export function addressPanel(domain: StoredDomain | null, status: ProjectStatus | null): AddressPanel | null {
  if (domain === null) return null;
  if (domain.isFreeAddress) return { hostname: domain.hostname, line: null };
  const beforeApproval = status === "onboarding" || status === "submitted" || status === "building" || status === "on_hold" || status === "preview" || status === "revisions";
  return { hostname: domain.hostname, line: beforeApproval ? "We connect it when you approve." : null };
}

/** The ways a visitor reaches the business through the website: chat, forms and the call and WhatsApp taps. */
export const SITE_ENQUIRY_KINDS: readonly EnquiryKind[] = ["chat", "form", "call_tap", "whatsapp_tap"];
export const ENQUIRY_WINDOW_DAYS = 30;

/** How many of these arrived in the last 30 days (newest first, as listEnquiries returns them). */
export function enquiriesSince(received: readonly { readonly receivedAt: Date }[], now: Date): number {
  const since = now.getTime() - ENQUIRY_WINDOW_DAYS * 86_400_000;
  return received.filter((row) => row.receivedAt.getTime() >= since).length;
}

/** The address part of a page's URL for the list: `/`, `/tests`. A URL that cannot be read is shown as stored. */
export function pagePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
