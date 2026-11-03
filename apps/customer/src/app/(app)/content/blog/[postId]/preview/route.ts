import { permanentRedirect } from "next/navigation";
import { postPreviewPath } from "@/features/blog/rules/paths";

/** Old address of "Preview on my website" (an editor link opened in a new tab). The destination checks access. */
export async function GET(_request: Request, context: { readonly params: Promise<{ readonly postId: string }> }): Promise<never> {
  const { postId } = await context.params;
  permanentRedirect(postPreviewPath(encodeURIComponent(postId)));
}
