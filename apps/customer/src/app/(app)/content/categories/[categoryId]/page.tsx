import { permanentRedirect } from "next/navigation";
import { categoryPath } from "@/features/blog/rules/paths";

/** Old address (plan 61, route map): the blog moved under Website. The destination checks access. */
export default async function MovedToCategory({ params }: { readonly params: Promise<{ readonly categoryId: string }> }): Promise<never> {
  const { categoryId } = await params;
  permanentRedirect(categoryPath(encodeURIComponent(categoryId)));
}
