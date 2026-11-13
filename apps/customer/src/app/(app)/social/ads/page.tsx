import { redirect } from "next/navigation";

/** Paid Ads moved out of Social media to its own page; an old link or bookmark lands there. */
export default function SocialAdsRedirect(): never {
  redirect("/ads");
}
