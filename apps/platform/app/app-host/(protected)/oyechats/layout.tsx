import type { ReactElement, ReactNode } from "react";
import { PageFrame } from "@/components/v2/page";
import { requireWebsiteClient } from "@/lib/server/customer-access";

/** The page frame for the OyeChats page. Its title is the page's one h1, so the page inside begins with a section. The page still checks access itself. */
export default async function Layout({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  await requireWebsiteClient();
  return (
    <PageFrame title="OyeChats" lede="The assistant on your website. It answers visitors, and the ones who leave their details show up here as leads.">
      {children}
    </PageFrame>
  );
}
