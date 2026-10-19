import { DIRECTORY_AD_SPOTS, weekEndsAt, type DirectoryAdPlacement, type LiveSpotRow, type StaffHeldSpot } from "@brandbasket/db";
import { AD_PLACEMENTS } from "@brandbasket/shared/lib/directory/ads";
import { spotHeldThrough } from "./advertise-booking";

/*
 * What each place an ad can show is showing right now, for the Advertise page's spot board: who holds each spot and
 * until when. Pure, so it is tested without a database. Who holds a spot is public (it is on the website), so the
 * advertiser sees the business's name; it is never what that business bid.
 */

export interface AdSpotHolder {
  readonly spot: number;
  readonly name: string;
  /** Whether it is the signed-in business's own ad. */
  readonly mine: boolean;
  readonly source: LiveSpotRow["source"];
  /**
   * When the spot is open again, unless the same week's result gives it to someone: the end of the week an auction win
   * was for, or the end of the whole unbroken run of weeks staff booked the spot for.
   */
  readonly endsAt: Date;
}

export interface AdSpotNow {
  readonly placement: DirectoryAdPlacement;
  readonly totalSpots: number;
  /** In spot order; shorter than totalSpots while spots are free. */
  readonly holders: readonly AdSpotHolder[];
}

/**
 * The spots of every placement, in the board's order, from this week's live rows in the business's market and its
 * city's home page. `held` is every week ahead that staff have booked: a staff-placed spot is shown until its whole run ends.
 */
export function spotsNow(rows: readonly LiveSpotRow[], businessId: string, held: readonly StaffHeldSpot[] = []): AdSpotNow[] {
  return AD_PLACEMENTS.map((placement) => ({
    placement,
    totalSpots: DIRECTORY_AD_SPOTS[placement],
    holders: rows
      .filter((row) => row.placement === placement)
      .sort((a, b) => a.spot - b.spot)
      .map((row) => ({
        spot: row.spot,
        name: row.ad.name,
        mine: row.businessId === businessId,
        source: row.source,
        endsAt: weekEndsAt((row.source === "staff" ? spotHeldThrough(held, row.placement, row.spot, row.weekStart) : null) ?? row.weekStart),
      })),
  }));
}
