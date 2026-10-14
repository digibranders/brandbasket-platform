import type { DirectoryAdPlacement } from "@firstfold/db";

/*
 * What the Advertise page calls each spot, in the owner's words. Its own small file because both the server page and
 * the client bid panel use it, and the panel must not import anything that reaches the database.
 */

export const SPOT_NAMES: Readonly<Record<DirectoryAdPlacement, string>> = {
  home: "Home page",
  top: "Top of the list",
  side: "Side picture",
  profile: "Business page",
};

export const SPOT_HINTS: Readonly<Record<DirectoryAdPlacement, string>> = {
  home: "A picture tile on the home page. Four tiles, seen by everyone in the city.",
  top: "The first result, above every other business.",
  side: "A picture card beside the list. The page has two.",
  profile: "A card on every business page in your category and area.",
};

/** "You and 2 others have bid": how many businesses are in for a spot, counting the owner as "you". */
export function biddersLabel(bidders: number, mine: boolean): string {
  if (mine) {
    const others = Math.max(0, bidders - 1);
    if (others === 0) return "Only you have bid so far";
    return `You and ${others} ${others === 1 ? "other" : "others"} have bid`;
  }
  if (bidders === 0) return "Nobody has bid yet";
  return bidders === 1 ? "1 business has bid" : `${bidders} businesses have bid`;
}
