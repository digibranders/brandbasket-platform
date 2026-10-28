import type { ReactElement, ReactNode } from "react";
import { PageFrame } from "@/components/v2/page";
import { getWebsiteAddress } from "@/lib/server/website-address";
import { WebsiteTabs } from "./website-tabs";

/**
 * The page frame, with the site's address under the title and the three tabs under that, around every Website page (the
 * website and content layouts both draw it). The title is the page's one h1, so the pages inside begin with a section.
 */
export async function WebsiteFrame({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  const address = await getWebsiteAddress();
  return (
    <PageFrame title="Your website" lede={address ?? undefined} tabs={<WebsiteTabs />}>
      {children}
    </PageFrame>
  );
}
