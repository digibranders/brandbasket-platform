import type { ReactElement, ReactNode } from "react";
import { BlogFrame } from "@/components/blog/blog-frame";
import { requireWebsiteClient } from "@/lib/server/customer-access";

/** Every page here sits inside the Blog frame, with its Posts, Authors and Categories tabs. Each page still checks access itself. */
export default async function Layout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  await requireWebsiteClient();
  return <BlogFrame>{children}</BlogFrame>;
}
