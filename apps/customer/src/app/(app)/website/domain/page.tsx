import type { Metadata } from "next";
import { Panel, PanelError } from "@/components";
import { DomainScreen } from "@/features/website/domain/components/domain-screen";
import { loadDomainPage } from "@/features/website/domain/loader";
import { loadWebsiteCore, loadWebsitePages } from "@/features/website/loader";
import { requireWebsite } from "@/lib/guards";

export const metadata: Metadata = { title: "Your domain" };

/** The web address and every step of moving to a domain of your own. The team's "domain ready" email links here (via /domain). */
export default async function WebsiteDomainPage() {
  const context = await requireWebsite();
  const core = await loadWebsiteCore(context.tenant);
  if (!core.ok) {
    return (
      <Panel title="Your domain">
        <PanelError failure={core.error} what="your web address" />
      </Panel>
    );
  }
  const [page, pages] = await Promise.all([loadDomainPage(context, core.data), core.data.live === null ? null : loadWebsitePages(context.tenant)]);
  if (!page.ok) {
    return (
      <Panel title="Your domain">
        <PanelError failure={page.error} what="your web address" />
      </Panel>
    );
  }
  return (
    <DomainScreen
      core={core.data}
      page={page.data}
      hasPages={pages !== null && pages.ok && pages.data.length > 0}
      currency={context.currency}
      canChange={context.role !== "viewer"}
    />
  );
}
