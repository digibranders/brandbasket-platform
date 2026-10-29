import type { ReactElement, ReactNode } from "react";
import { PageFrame } from "@/components/v2/page";
import { SectionTabs } from "@/components/v2/section-tabs";
import { BLOG_TABS } from "@/lib/blog/tabs";

/** The page frame, with the blog's tabs under the title, around every Blog page. The title is the page's one h1, so the pages inside begin with a section. */
export function BlogFrame({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <PageFrame title="Blog" tabs={<SectionTabs tabs={BLOG_TABS} label="Blog" />}>
      {children}
    </PageFrame>
  );
}
