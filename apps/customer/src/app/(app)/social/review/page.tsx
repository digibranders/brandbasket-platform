import type { Metadata } from "next";
import { NotBought } from "@/features/setup/components/not-bought";
import { postingServiceSettings } from "@/features/social/analytics/rules";
import { ReviewView } from "@/legacy-social/components/review-view";
import { loadSocialReview } from "@/legacy-social/server/social-review";
import { requirePaid } from "@/lib/guards";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Look over your posts" };

/** The posts written from the customer's website, to look over: the facts, the words for each network, the pictures. */
export default async function SocialReviewPage() {
  const customer = await requirePaid();
  if (!customer.services.includes("social")) return <NotBought service="social" customer={customer} />;
  if (postingServiceSettings(process.env) === null) notFound();
  return <ReviewView review={await loadSocialReview(customer)} canChange={customer.role !== "viewer"} />;
}
