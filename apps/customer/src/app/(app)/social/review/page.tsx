import type { Metadata } from "next";
import { NotBought } from "@/features/setup/components/not-bought";
import { postingServiceSettings } from "@/features/social/analytics/rules";
import { ApprovalsSection, waitingIn } from "@/features/social/components/parts";
import { loadPosts } from "@/features/social/loader";
import { load } from "@/lib/loaded";
import { ReviewView } from "@/legacy-social/components/review-view";
import { loadSocialReview } from "@/legacy-social/server/social-review";
import { requirePaid } from "@/lib/guards";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Posts" };

/** The posts written from the customer's website, to look over: the facts, the words for each network, the pictures. */
export default async function SocialReviewPage() {
  const customer = await requirePaid();
  if (!customer.services.includes("social")) return <NotBought service="social" customer={customer} />;
  if (postingServiceSettings(process.env) === null) notFound();
  const now = new Date();
  const [review, posts] = await Promise.all([loadSocialReview(customer), load("social.posts", () => loadPosts(customer, now))]);
  const waiting = waitingIn(posts);
  return <ReviewView review={review} canChange={customer.role !== "viewer"} approvals={waiting === null || waiting === 0 ? null : <ApprovalsSection customer={customer} posts={posts} layout="cards" now={now} />} />;
}
