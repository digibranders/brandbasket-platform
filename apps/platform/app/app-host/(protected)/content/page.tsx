import { redirect } from "next/navigation";

/**
 * Content is the blog, and only the blog.
 *
 * Customers used to edit their website's own text, images and gallery from here. That was retired on 2026-09-21:
 * client websites are built and changed by the Fynix team now, priced as change hours, and the one thing a
 * customer adds themselves is blog posts. The sidebar still says "Content", so this keeps that link working and
 * sends it where the writing happens.
 */
export default function ContentPage(): never {
  redirect("/content/blog");
}
