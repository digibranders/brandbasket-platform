import { domainPageState, type DomainPageInput } from "@/lib/domain-page";

interface SiteAddressInput {
  readonly liveHostname: string | null;
  readonly domainHostname: string | null;
  /** True when `domainHostname` is the free `*.brandbasket.in` address, not a domain the customer owns. */
  readonly domainIsTemporary: boolean;
}

/** The address shown under "Your website": the live site's, else the free address, else nothing (their own domain is not shown before it works). */
export function siteAddress({ liveHostname, domainHostname, domainIsTemporary }: SiteAddressInput): string | null {
  if (liveHostname !== null) return liveHostname;
  return domainHostname !== null && domainIsTemporary ? domainHostname : null;
}

/** The host written in the preview picture's address bar, or null when the stored link is not a web link. */
export function previewHost(url: string | null): string | null {
  if (url === null) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.host : null;
  } catch {
    return null;
  }
}

export interface AddressCardView {
  readonly hostname: string;
  readonly chip: string;
  /** One sentence, or null when there is nothing to do. */
  readonly line: string | null;
  /** Whether the soft button to /domain shows. */
  readonly showHow: boolean;
}

/**
 * The web address card, only when the customer owes something (the records at their domain company) or the site is live on a
 * domain of their own. Every other state of the domain page is the customer's to open, not a card on Progress.
 */
export function addressCardView(input: Omit<DomainPageInput, "moving">): AddressCardView | null {
  const hostname = input.domain?.hostname;
  if (hostname === undefined) return null;
  // shortcut: a live site moving to a domain of its own (the domain page's "move-connect") is not loaded here, so it shows no card; it is on /domain.
  switch (domainPageState({ ...input, moving: null })) {
    case "own-connect":
      return {
        hostname,
        chip: "One step left for you",
        line: "Change one setting where you bought the name, so it points to your new site. About 5 minutes.",
        showHow: true,
      };
    case "own-live":
      return { hostname, chip: "Connected", line: null, showHow: false };
    default:
      return null;
  }
}
