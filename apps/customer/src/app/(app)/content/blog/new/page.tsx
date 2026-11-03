import { redirect } from "next/navigation";
import { BLOG_NEW_PATH } from "@/features/blog/rules/paths";

/** Old address (plan 61, route map): the blog moved under Website. The destination checks access. */
export default function MovedToNewPost(): never {
  redirect(BLOG_NEW_PATH);
}
