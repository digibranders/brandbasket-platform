import { findLiveBundledAddOns, findOpenClosureForBusiness } from "@brandbasket/db";
import type { ReactElement, ReactNode } from "react";
import { PLAN_TIER_LABELS } from "@brandbasket/shared/lib/billing/plan-tier";
import { BILLING_CURRENCY_LABELS } from "@brandbasket/shared/lib/currency";
import { PROJECT_STATUS_LABELS } from "@brandbasket/shared/lib/project-status";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { ClientTabs } from "@/components/client-tabs";
import { Avatar } from "@/components/console/avatar";
import { PageHeader } from "@/components/console/page-header";
import { StageTrack } from "@/components/console/stage-track";
import { StatusPill } from "@/components/console/status-pill";
import { ServiceTags } from "@/components/service-tags";
import { clientTabHref, tabsFor } from "@/lib/client-tabs";
import { clientStage } from "@/lib/pipeline";
import { loadClient } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

/** Every tab of a client: who they are, what they buy, where they stand, and the tabs this role may open. */
export default async function ClientLayout({
  params,
  children,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly children: ReactNode;
}): Promise<ReactElement> {
  const { staff } = await requireStaffAccess();
  const { businessId } = await params;
  const client = await loadClient(businessId);
  const db = getStaffDb();
  const [lines, closure] = await Promise.all([findLiveBundledAddOns(db, client.businessId), findOpenClosureForBusiness(db, client.businessId)]);
  const addOns = [...new Set(lines.map((line) => line.addOn))];
  const { project } = client;

  return (
    <>
      <PageHeader
        back={{ href: "/clients", label: "Clients" }}
        lead={<Avatar id={client.businessId} name={client.businessName} size="lg" />}
        title={client.businessName}
        meta={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {client.owner?.name ?? "No owner"} · {PLAN_TIER_LABELS[client.tier]} ·{" "}
              {project === null ? "No project yet" : PROJECT_STATUS_LABELS[project.status]} · Billed in{" "}
              {BILLING_CURRENCY_LABELS[client.currency]}
            </span>
            <ServiceTags addOns={addOns} />
            {closure === null ? null : (
              <StatusPill tone="problem">
                Leaving, erased on <LocalDate iso={closure.eraseAfter.toISOString()} />
              </StatusPill>
            )}
          </span>
        }
      >
        <StageTrack stage={clientStage(client)} />
      </PageHeader>
      <ClientTabs tabs={tabsFor(staff.role).map((tab) => ({ href: clientTabHref(client.businessId, tab.slug), label: tab.label }))} />
      <div className="mt-8">{children}</div>
    </>
  );
}
