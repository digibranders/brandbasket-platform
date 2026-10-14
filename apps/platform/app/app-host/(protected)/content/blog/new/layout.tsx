import type { Metadata } from "next";
import type { ReactNode } from "react";

// page.tsx here is a client component (it needs useActionState), and a client component cannot export metadata,
// so the tab title lives in this pass-through layout. Without it the tab read "Your dashboard".
export const metadata: Metadata = { title: "New post" };

export default function NewBlogPostLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}
