import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ClientAddOns } from "@/components/client-add-ons";
import { ClientChatbots } from "@/components/client-chatbots";
import { readAddOnNotice } from "@/lib/add-on-notices";
import { readChatbotNotice } from "@/lib/chatbot-form";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { loadClientChatbots } from "@/lib/server/chatbots-admin";
import { openClientTab } from "@/lib/server/client-page";
import { serverEnv } from "@/lib/server/env";

export const metadata: Metadata = { title: "Client services" };

export default async function ClientServicesPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly businessId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { businessId } = await params;
  const { client } = await openClientTab(businessId, "services");
  const sp = await searchParams;
  const [clientAddOns, clientChatbots] = await Promise.all([loadClientAddOns(client.businessId, new Date()), loadClientChatbots(client.businessId)]);

  return (
    <>
      <ClientAddOns
        businessId={client.businessId}
        addOns={clientAddOns.addOns}
        bundledAddOns={clientAddOns.bundledAddOns}
        pressReleases={clientAddOns.pressReleases}
        options={clientAddOns.options}
        notice={readAddOnNotice(sp.addOns)}
        keptStartsOn={clientAddOns.keptStartsOn}
      />
      <ClientChatbots
        businessId={client.businessId}
        chatbots={clientChatbots}
        notice={readChatbotNotice(sp.chatbots)}
        webhookUrl={`${serverEnv().APP_ORIGIN}/api/webhooks/oyechats`}
      />
    </>
  );
}
