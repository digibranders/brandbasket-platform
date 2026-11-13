import type { Metadata } from "next";
import { AuthorsScreen } from "@/features/blog/components/taxonomy-screens";
import { loadAuthors, loadHasPages } from "@/features/blog/loader";
import { canWriteBlog } from "@/features/blog/server/access";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Authors" };

export default async function AuthorsPage() {
  const customer = await requireWebsite();
  const now = new Date();
  const [authors, hasPages] = await Promise.all([loadAuthors(customer, now), loadHasPages(customer)]);
  return <AuthorsScreen rows={authors} canWrite={canWriteBlog(customer)} hasPages={hasPages} now={now} />;
}
