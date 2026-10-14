import spotData from "./where-it-shows-spots.json";

/**
 * What sits behind "See where this shows": one real screenshot of a business page (Digibranders) and, for each
 * dashboard input, the box on it that the input controls. The box is given as fractions of the page, so the
 * dashboard can spotlight it at any size. Both come from scripts/capture-where-it-shows.py.
 */
export const WHERE_IT_SHOWS_PAGE = { src: "/where-it-shows/page.webp", width: spotData.width, height: spotData.height } as const;

/** The short tag on the spotlight, saying what the owner's input becomes there. */
export const WHERE_IT_SHOWS_LABELS = {
  "cover-photos": "Your photos",
  buttons: "Your buttons",
  about: "Your description",
  offers: "Your deals",
  services: "Your services",
  products: "Your products",
  location: "Your address",
  hours: "Your opening hours",
  gallery: "Your gallery",
} as const;

export type WhereItShowsSpot = keyof typeof WHERE_IT_SHOWS_LABELS;

export interface SpotBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const BOXES: Readonly<Record<string, SpotBox>> = spotData.spots;

/** The spot's box on the page picture; throws if the capture script has not recorded it. */
export function spotBox(spot: WhereItShowsSpot): SpotBox {
  const box = BOXES[spot];
  if (box === undefined) throw new Error(`No box for the "${spot}" spot: run scripts/capture-where-it-shows.py.`);
  return box;
}
