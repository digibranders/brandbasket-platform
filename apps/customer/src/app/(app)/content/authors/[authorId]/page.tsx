import { permanentRedirect } from "next/navigation";
import { authorPath } from "@/features/blog/rules/paths";

/** Old address (plan 61, route map): the blog moved under Website. The destination checks access. */
export default async function MovedToAuthor({ params }: { readonly params: Promise<{ readonly authorId: string }> }): Promise<never> {
  const { authorId } = await params;
  permanentRedirect(authorPath(encodeURIComponent(authorId)));
}
