import { DIRECTORY_AD_SPOTS, type DirectoryAdPlacement } from "@fynix/db";
import { AD_PLACEMENT_LABELS, marketLabel } from "@fynix/shared/lib/directory/ads";

const DOT = " · ";

interface PlacedSpot {
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
}

/** The spot alone: "Top of the list", "Side spot 2", "Business page", "Home page, tile 3". */
export function spotLabel({ placement, spot }: PlacedSpot): string {
  const label = AD_PLACEMENT_LABELS[placement];
  if (DIRECTORY_AD_SPOTS[placement] === 1) return label;
  return placement === "home" ? `${label}, tile ${spot}` : `${label} ${spot}`;
}

/** Where an ad shows, for a staff list: "Home page · Thane · tile 2", or "Dentists in Naupada, Thane · Side spot 2". */
export function placementLine(ad: PlacedSpot & { readonly categorySlug: string; readonly citySlug: string; readonly areaSlug: string }): string {
  if (ad.placement === "home") {
    return [AD_PLACEMENT_LABELS.home, marketLabel(ad), `tile ${ad.spot}`].join(DOT);
  }
  return [marketLabel(ad, { home: false }), spotLabel(ad)].join(DOT);
}
