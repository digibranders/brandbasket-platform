import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactElement } from "react";
import { EmptyState } from "@brandbasket/shared/ui/patterns";
import { staffCan } from "@brandbasket/shared/lib/access";
import { ClientChatbots } from "@/components/client-chatbots";
import { AccountsSection } from "@/components/console/accounts-section";
import { CampaignsSection } from "@/components/console/campaigns-section";
import { Fold } from "@/components/console/fold";
import { NumbersSection } from "@/components/console/numbers-section";
import { ServicesTabCards } from "@/components/console/services-tab-cards";
import { TryAgain } from "@/components/console/try-again";
import { UpdatesSection } from "@/components/console/updates-section";
import { WorkSection } from "@/components/console/work-section";
import { readChatbotNotice } from "@/lib/chatbot-form";
import { clientTabHref, forwardedNoticeHref } from "@/lib/client-tabs";
import { readWorkNotice } from "@/lib/work-notices";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { loadClientChatbots } from "@/lib/server/chatbots-admin";
import { loadOverviewReads, readOnce } from "@/lib/server/client-overview";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import type { AccountNotice } from "../account-actions";
import type { CampaignNotice } from "../campaign-actions";

export const metadata: Metadata = { title: "Client services" };

/** The notice a query value names, or null: the query only picks a line, never supplies text. */
function readNotice<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | null {
  return allowed.find((notice) => notice === value) ?? null;
}

function Problem({ children }: { readonly children: string }): ReactElement {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-neg-border bg-neg-wash p-4">
      <p className="min-w-0 flex-1 text-sm font-semibold text-neg-text">{children}</p>
      <TryAgain />
    </div>
  );
}

/**
 * The Services tab: one card per service this client has, the Paid Ads figures, the OyeChats form and the legacy manual
 * tools. An old /services link carrying a notice that another tab owns still lands on that tab.
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
  const sp = await searchParams;
  const forward = forwardedNoticeHref(client.businessId, sp);
  if (forward !== null && !forward.startsWith(clientTabHref(client.businessId, "services"))) redirect(forward);

  const { services } = await loadOverviewReads({ client, now: new Date(), seesMoney: staffCan(granted.staff.role, "money") });
  if (!services.ok) return <Problem>We could not load the services. Nothing was changed.</Problem>;
  if (services.value.length === 0) {
    return <EmptyState title="No services yet." description="Services appear here once they have paid." />;
  }

  const db = getStaffDb();
  const [websiteBought, chatbots] = await Promise.all([
    readOnce("website-bought", () => isWebsiteBought(db, client.businessId)),
    readOnce("chatbots", () => loadClientChatbots(client.businessId)),
  ]);

  const numbersNotice = sp.numbers === "saved" || sp.numbers === "invalid" || sp.numbers === "not-bought" ? sp.numbers : null;
  const updatesNotice = sp.updates === "added" || sp.updates === "removed" || sp.updates === "invalid" ? sp.updates : null;
  const campaignNotice = readNotice(sp.campaigns, ["saved", "removed", "invalid", "duplicate", "not-bought", "not-found"] as const satisfies readonly CampaignNotice[]);
  const accountNotice = readNotice(sp.accounts, ["saved", "removed", "invalid", "not-bought", "not-found"] as const satisfies readonly AccountNotice[]);
  const legacyNoticeShown = sp.work !== undefined || sp.campaigns !== undefined || sp.accounts !== undefined || sp.updates !== undefined;

  return (
    <>
      <ServicesTabCards
        businessId={client.businessId}
        services={services.value}
        figures={<NumbersSection businessId={client.businessId} notice={numbersNotice} scope="ads" />}
      />
      {!websiteBought.ok || !chatbots.ok ? (
        <div className="mt-6">
          <Problem>We could not load the chatbots. Nothing was changed.</Problem>
        </div>
      ) : websiteBought.value ? (
        <ClientChatbots
          businessId={client.businessId}
          chatbots={chatbots.value}
          notice={readChatbotNotice(sp.chatbots)}
          webhookUrl={`${serverEnv().APP_ORIGIN}/api/webhooks/oyechats`}
        />
      ) : null}
      <div className="mt-6">
        <Fold title="Legacy manual tools" open={legacyNoticeShown}>
          <p className="max-w-xl text-sm text-ink-2">
            Posts and reports, campaigns, accounts and updates for the customer. Kept until the owner confirms no customer uses them.
          </p>
          <WorkSection businessId={client.businessId} notice={readWorkNotice(sp.work)} />
          <CampaignsSection businessId={client.businessId} notice={campaignNotice} />
          <AccountsSection businessId={client.businessId} notice={accountNotice} />
          <UpdatesSection businessId={client.businessId} notice={updatesNotice} />
        </Fold>
      </div>
    </>
  );
}
