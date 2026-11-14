import type { CustomerContext } from "@/lib/guards";
import { load } from "@/lib/loaded";
import { PanelError } from "@/components";
import { Panel } from "@/components";
import { postingServiceSettings } from "@/features/social/analytics/rules";
import { readChecklistState } from "@/features/checklist/loader";
import { loadReportMonths } from "@/features/reports/loader";
import { reportPath } from "@/features/reports/rules";
import { loadLegacySocial } from "@/legacy-social/server/load";
import { LegacySocialView } from "./social-view";

/**
 * The Content calendar page for a business (the posts our team has waiting for its OK now sit on the Posts tab). A failed read of the posting service is this page's error state, never an empty calendar.
 */
export async function LegacySocialPage({ customer, notice, now = new Date() }: { readonly customer: CustomerContext; readonly notice: { readonly ok: boolean; readonly text: string } | null; readonly now?: Date }) {
  const [data, months, setup] = await Promise.all([
    load("social.legacy", () => loadLegacySocial(customer, now)),
    load("social.report", () => loadReportMonths(customer)),
    load("social.setup", () => readChecklistState(customer)),
  ]);
  // The newest month that has a sent Social media report; a failed read just leaves the button off (it is in Sentry via load).
  const newest = months.ok ? months.data.find((month) => month.reports.some((report) => report.service === "social")) : undefined;
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
    />
  );
}
