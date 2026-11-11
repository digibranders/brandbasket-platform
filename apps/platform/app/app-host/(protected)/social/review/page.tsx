import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { ReviewView } from "@/components/social/review-view";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSocial } from "@/lib/server/social";
import { loadSocialReview } from "@/lib/server/social-review";

export const metadata: Metadata = { title: "Look over your posts" };

/** The posts written from the customer's website, to look over: the facts, the words for each network, the pictures. */
export default async function SocialReviewPage(): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  if (!billing.hasAccess) redirect("/");
  // Not bought: Your plan is where Social media is added.
  if ((await loadSocial(tenant, new Date())) === null) redirect(ADD_ONS_PATH);
  return <ReviewView review={await loadSocialReview(tenant)} />;
}
