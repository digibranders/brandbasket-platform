import type { Metadata } from "next";
import type { ReactNode } from "react";

// page.tsx is a client component (it needs useActionState), which cannot export metadata.
export const metadata: Metadata = { title: "New author" };

export default function NewAuthorLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}
