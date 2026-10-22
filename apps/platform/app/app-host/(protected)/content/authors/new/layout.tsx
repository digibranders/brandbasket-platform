import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireWebsiteClient } from "@/lib/server/customer-access";

// page.tsx is a client component (it needs useActionState), which cannot export metadata.
export const metadata: Metadata = { title: "New author" };

export default async function NewAuthorLayout({ children }: { readonly children: ReactNode }): Promise<ReactNode> {
  await requireWebsiteClient();
  return children;
}
