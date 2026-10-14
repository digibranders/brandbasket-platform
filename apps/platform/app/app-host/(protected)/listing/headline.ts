import type { ListingStage } from "@fynix/shared/lib/directory/stage";

export interface ListingHeadlineInput {
  readonly stage: ListingStage;
  /** The client's Show in directory switch. listingStage lets a lapsed payment win over it; the headline does not. */
  readonly visible: boolean;
  /** The category's label, e.g. "Dentists". */
  readonly category: string;
  /** The area's name, e.g. "Naupada". */
  readonly area: string;
}

/**
 * The one line under the Listing tab's heading. A paused listing the client has also hidden is not in the feed at
 * all, so it must not claim to be "shown as a basic listing".
 */
export function listingHeadline({ stage, visible, category, area }: ListingHeadlineInput): string {
  switch (stage) {
    case "building":
      return "Your listing goes live on the local directory the day your website launches.";
    case "paused":
      return visible
        ? "You're shown as a basic listing until your payment goes through."
        : "You're hidden from the local directory. Pay to show your listing again.";
    case "hidden":
      return "You're hidden from the local directory. Everything is kept.";
    case "live":
      return `People looking for ${category.toLowerCase()} in ${area} find you here.`;
  }
}
