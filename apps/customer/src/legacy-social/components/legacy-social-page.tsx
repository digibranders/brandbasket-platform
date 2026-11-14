import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { PanelError } from "@/components";
import { Panel } from "@/components";
import { postingServiceSettings } from "@/features/social/analytics/rules";
import { readChecklistState } from "@/features/checklist/loader";
import { loadReportMonths } from "@/features/reports/loader";
import { reportPath } from "@/features/reports/rules";
import { loadBrands, socialAutoSettings } from "@/legacy-social/server/social-auto";
import type { AccountInUse } from "@/features/social/accounts/rules";
import { loadChannelState } from "@/legacy-social/server/channel-todos";
import { loadLegacySocial } from "@/legacy-social/server/load";
import { LegacySocialView } from "./social-view";

/**
 * The Content calendar page for a business (the posts our team has waiting for its OK now sit on the Posts tab). A failed read of the posting service is this page's error state, never an empty calendar.
 */
/** The brand of this business that holds an account the customer tried to connect here, by name; null when it is not one of her brands (another customer's is never named). */
async function holderName(customer: CustomerContext, inUse: AccountInUse | null): Promise<string | null> {
  if (inUse === null) return null;
  try {
    const settings = socialAutoSettings();
    if (settings === null) return null;
    const brands = await loadBrands(settings, customer.businessId, customer.businessName);
    return brands?.brands.find((one) => one.externalId === inUse.heldBy)?.name ?? null;
  } catch {
    return null;
  }
}

export async function LegacySocialPage({ customer, notice, inUse = null, now = new Date() }: { readonly customer: CustomerContext; readonly notice: { readonly ok: boolean; readonly text: string } | null; readonly inUse?: AccountInUse | null; readonly now?: Date }) {
  const heldByName = await holderName(customer, inUse);
  const [data, months, setup] = await Promise.all([
    load("social.legacy", () => loadLegacySocial(customer, now)),
    load("social.report", () => loadReportMonths(customer)),
    load("social.setup", () => readChecklistState(customer)),
  ]);
  // The newest month that has a sent Social media report; a failed read just leaves the button off (it is in Sentry via load).
  const newest = months.ok ? months.data.find((month) => month.reports.some((report) => report.service === "social")) : undefined;
  // The number beside each channel, as on the Posts page; left off when it cannot be read.
  const channelState = data.ok && data.data !== null ? await loadChannelState(customer, data.data.channels.map((channel) => channel.platform)) : undefined;
  if (!data.ok || data.data === null) {
    return (
      <Panel title="Social media">
        {data.ok ? null : <PanelError failure={data.error} what="your social media" />}
      </Panel>
    );
  }
  // The website given in setup is the business's own, so it is offered only for its first brand: another brand has a website of its own to give.
  const answer = setup.ok && data.data.brand.externalId === customer.businessId ? setup.data.answers.social?.["websiteUrl"] : undefined;
  const savedWebsite = typeof answer === "string" && answer.trim() !== "" ? answer : null;
  return (
    <LegacySocialView
      data={data.data}
      notice={notice}
      now={now}
      reportHref={newest === undefined ? null : reportPath(newest.key)}
      hasNumbers={data.data.channels.some((channel) => channel.platform !== "linkedin") && postingServiceSettings(process.env) !== null}
      canChange={customer.role !== "viewer"}
      savedWebsite={savedWebsite}
      channelState={channelState}
      move={inUse !== null && heldByName !== null ? { channel: inUse.channel, heldBy: inUse.heldBy, brandName: heldByName } : null}
    />
  );
}
