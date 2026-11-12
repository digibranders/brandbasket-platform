import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { AnalyticsView } from "@/components/social/analytics-view";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { loadSocial } from "@/lib/server/social";
import { loadSocialAnalytics } from "@/lib/server/social-analytics";
import { channelFrom, rangeFrom, tabFrom } from "@/lib/social/analytics";

export const metadata: Metadata = { title: "Analytics" };

interface AnalyticsPageProps {
  readonly searchParams: Promise<{ readonly range?: string | readonly string[]; readonly channel?: string | readonly string[]; readonly tab?: string | readonly string[] }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps): Promise<ReactElement> {
  const { tenant, billing } = await requireCustomerAccess();
  if (!billing.hasAccess) redirect("/");
  const now = new Date();
  const [data, params] = await Promise.all([loadSocial(tenant, now), searchParams]);
  // Not bought: Your plan is where Social media is added. Bought but not set up here: nothing to count yet.
  if (data === null) redirect(ADD_ONS_PATH);
  if (data.connect === null) redirect("/social");
  const social = await loadSocialAnalytics(tenant, now, rangeFrom(params.range));
  return <AnalyticsView social={social} connected={data.connect.channels.map((channel) => channel.platform)} report={data.report} accounts={data.connect.channels.map((channel) => ({ id: channel.id, platform: channel.platform, account: channel.account }))} channel={channelFrom(params.channel)} tab={tabFrom(params.tab)} />;
}
