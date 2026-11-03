import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { Panel, PanelError } from "@/components";
import { NotBoughtScreen } from "@/features/website/components/not-bought-screen";
import { WebsiteScreen } from "@/features/website/components/website-screen";
import { loadWebsiteCore, loadWebsiteOffer, loadWebsiteOverview, loadWebsitePages } from "@/features/website/loader";
import { holdsWebsite } from "@/features/website/rules/not-bought";
import { readWebsiteNotice } from "@/features/website/rules/notices";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Website" };

/** Website Overview. A business without the Managed Website sees what it is and its price, not a redirect. */
export default async function WebsitePage({ searchParams }: { readonly searchParams: Promise<{ readonly response?: string | string[] }> }) {
  const context = await requirePaid();
  if (!holdsWebsite(context)) return <NotBoughtScreen offer={await loadWebsiteOffer(context)} currency={context.currency} canAdd={context.role !== "viewer"} />;

  const notice = readWebsiteNotice((await searchParams).response);
  const core = await loadWebsiteCore(context.tenant);
  if (!core.ok) {
    return (
      <Panel title="Website">
        <PanelError failure={core.error} what="your website" />
      </Panel>
    );
  }
  const now = new Date();
  const [overview, pages] = await Promise.all([loadWebsiteOverview(context, core.data, now), core.data.live === null ? null : loadWebsitePages(context.tenant)]);
  // A fresh key per render: a double press of Send changes finds the ticket the first press saved.
  return <WebsiteScreen context={context} core={core.data} overview={overview} pages={pages} notice={notice} feedbackKey={randomUUID()} now={now} />;
}
