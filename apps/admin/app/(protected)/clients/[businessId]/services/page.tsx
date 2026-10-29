import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ClientAddOns } from "@/components/client-add-ons";
import { ClientChatbots } from "@/components/client-chatbots";
import { NumbersSection } from "@/components/console/numbers-section";
import { UpdatesSection } from "@/components/console/updates-section";
import { WorkSection } from "@/components/console/work-section";
import { readAddOnNotice } from "@/lib/add-on-notices";
import { readChatbotNotice } from "@/lib/chatbot-form";
import { readWorkNotice } from "@/lib/work-notices";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { loadClientChatbots } from "@/lib/server/chatbots-admin";
import { openClientTab } from "@/lib/server/client-page";
import { getStaffDb } from "@/lib/server/db";
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
  const [clientAddOns, clientChatbots, websiteBought] = await Promise.all([
    loadClientAddOns(client.businessId, new Date()),
    loadClientChatbots(client.businessId),
    isWebsiteBought(getStaffDb(), client.businessId),
  ]);

  const updatesNotice = sp.updates === "added" || sp.updates === "removed" || sp.updates === "invalid" ? sp.updates : null;
  const numbersNotice = sp.numbers === "saved" || sp.numbers === "invalid" || sp.numbers === "not-bought" ? sp.numbers : null;

  return (
    <>
      <WorkSection businessId={client.businessId} notice={readWorkNotice(sp.work)} />
      <NumbersSection businessId={client.businessId} notice={numbersNotice} />
      <UpdatesSection businessId={client.businessId} notice={updatesNotice} />
      <ClientAddOns
        businessId={client.businessId}
        addOns={clientAddOns.addOns}
        bundledAddOns={clientAddOns.bundledAddOns}
        pressReleases={clientAddOns.pressReleases}
        options={clientAddOns.options}
        notice={readAddOnNotice(sp.addOns)}
        keptStartsOn={clientAddOns.keptStartsOn}
      />
      {websiteBought ? (
        <ClientChatbots
          businessId={client.businessId}
          chatbots={clientChatbots}
          notice={readChatbotNotice(sp.chatbots)}
          webhookUrl={`${serverEnv().APP_ORIGIN}/api/webhooks/oyechats`}
        />
      ) : null}
    </>
  );
}
