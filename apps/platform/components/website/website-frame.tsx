import type { ReactElement, ReactNode } from "react";
import { SectionTabs } from "@/components/v2/section-tabs";
import { PageFrame } from "@/components/v2/page";
import { getWebsiteAddress } from "@/lib/server/website-address";
import { WEBSITE_TABS } from "@/lib/website/tabs";

/**
 * The page frame, with the site's address under the title and the tabs under that, around every Website page (the website,
 * enquiries and content layouts all draw it). The title is the page's one h1, so the pages inside begin with a section.
 */
export async function WebsiteFrame({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  const address = await getWebsiteAddress();
  return (
    <PageFrame title="Website" lede={address ?? undefined} tabs={<SectionTabs tabs={WEBSITE_TABS} label="Website" />}>
      {children}
    </PageFrame>
  );
}
