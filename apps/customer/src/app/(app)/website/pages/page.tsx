import type { Metadata } from "next";
import { Panel, PanelError } from "@/components";
import { PagesScreen } from "@/features/website/components/pages-screen";
import { loadWebsiteCore, loadWebsitePages } from "@/features/website/loader";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Pages" };

/** The website's pages, from the nightly sitemap sync. With none, an honest empty state (the Pages tab is hidden then). */
export default async function WebsitePagesPage() {
  const context = await requireWebsite();
  const [core, pages] = await Promise.all([loadWebsiteCore(context.tenant), loadWebsitePages(context.tenant)]);
  if (!core.ok) {
    return (
      <Panel title="Pages">
        <PanelError failure={core.error} what="your website" />
      </Panel>
    );
  }
  return <PagesScreen core={core.data} pages={pages} now={new Date()} />;
}
