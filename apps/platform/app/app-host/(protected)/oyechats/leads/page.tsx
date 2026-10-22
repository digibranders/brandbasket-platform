import type { Metadata } from "next";
import type { ReactElement } from "react";
import { LeadPagination } from "@/components/panel/oyechats/lead-pagination";
import { LeadTable } from "@/components/panel/oyechats/lead-table";
import { NoAssistantYet, OyeChatsIntro } from "@/components/panel/oyechats/oyechats-intro";
import { buildLeadRows, readPageParam } from "@/lib/chatbots-view";
import { loadBotActivity } from "@/lib/server/chatbot-conversations";
import { LEADS_PER_PAGE, loadLeadsPage } from "@/lib/server/chatbots";
import { requireWebsiteClient } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "OyeChats leads" };

/**
 * The visitors who left their details in the customer's OyeChats assistant, ten to a page, newest first: a serial number,
 * their name and how many messages they exchanged, and a pop-up with the conversation when one is selected. Leads arrive
 * from OyeChats (app/api/webhooks/oyechats); the conversations are read from OyeChats itself when asked for.
 */
export default async function OyeChatsLeadsPage({ searchParams }: { readonly searchParams: Promise<{ readonly page?: string | string[] }> }): Promise<ReactElement> {
  const customer = await requireWebsiteClient();
  const { page: requested } = await searchParams;
  const { bots, leads, total, page, pageCount } = await loadLeadsPage(customer, readPageParam(requested));
  // Message counts come from OyeChats itself. A bot without a key, or OyeChats being down, only means the
  // count shows a dash: the leads Brandbasket already holds are listed regardless.
  const activity = await loadBotActivity(bots);
  const rows = buildLeadRows(leads, activity, new Map(bots.map((bot) => [bot.id, bot.name] as const)));

  return (
    <>
      <h1 className="panel-title">Leads</h1>
      <OyeChatsIntro />

      {bots.length === 0 ? (
        <NoAssistantYet />
      ) : total === 0 ? (
        <p className="mt-8 max-w-2xl text-sm text-ink-soft">
          No leads yet. When a visitor leaves their details in your OyeChats assistant, they appear here.
        </p>
      ) : (
        <div className="mt-8">
          <LeadTable rows={rows} showBot={bots.length > 1} firstNumber={(page - 1) * LEADS_PER_PAGE + 1} />
          <LeadPagination page={page} pageCount={pageCount} perPage={LEADS_PER_PAGE} total={total} />
        </div>
      )}
    </>
  );
}
