import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import { ServiceCards } from "@/components/console/client-overview-cards";
import { TryAgain } from "@/components/console/try-again";
import { forwardedNoticeHref } from "@/lib/client-tabs";
import { loadOverviewReads } from "@/lib/server/client-overview";
import { openClientTab } from "@/lib/server/client-page";
import { staffCan } from "@brandbasket/shared/lib/access";

export const metadata: Metadata = { title: "Client services" };

/**
 * The Services tab. Until its forms move here (CR-07) it lists the services this client has and where each is run today.
 * An old /services link carrying a notice query still lands on the tab that shows that notice.
 */
export default async function ClientServicesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { granted, client } = await openClientTab(businessId, "services");
  const forward = forwardedNoticeHref(client.businessId, await searchParams);
  if (forward !== null) redirect(forward);

  const { services } = await loadOverviewReads({ client, now: new Date(), seesMoney: staffCan(granted.staff.role, "money") });
  if (!services.ok) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-neg-border bg-neg-wash p-4">
        <p className="min-w-0 flex-1 text-sm font-semibold text-neg-text">We could not load the services. Nothing was changed.</p>
        <TryAgain />
      </div>
    );
  }
  if (services.value.length === 0) {
    return <EmptyState title="No services yet." description="Services appear here once they have paid." />;
  }
  return <ServiceCards businessId={client.businessId} services={services.value} linkTo="work" />;
}
