import { Users } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ChatbotPanel } from "@/components/panel/oyechats/chatbot-panel";
import { LeadFigures } from "@/components/panel/oyechats/lead-figures";
import { LeadPagination } from "@/components/panel/oyechats/lead-pagination";
import { LeadTable } from "@/components/panel/oyechats/lead-table";
import { NoAssistantYet, OyeChatsHelp } from "@/components/panel/oyechats/oyechats-intro";
import { EmptyState, PageColumns, PageSection } from "@/components/v2/page";
import { buildLeadRows, readPageParam } from "@/lib/chatbots-view";
import { loadBotActivity } from "@/lib/server/chatbot-conversations";
import { LEADS_PER_PAGE, loadLeadsPage } from "@/lib/server/chatbots";
import { requireWebsiteClient } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "Enquiries" };

/**
 * The customer's OyeChats assistant in one place: how many leads it has caught lately, the leads themselves (ten to a page,
 * newest first, each with the day, how warm OyeChats rates it and how many messages they exchanged, and a pop-up with the
 * conversation when one is selected), and beside them the assistant's name and status. Leads arrive from OyeChats
 * (app/api/webhooks/oyechats); the conversations are read from OyeChats itself when asked for.
 */
export default async function OyeChatsPage({ searchParams }: { readonly searchParams: Promise<{ readonly page?: string | string[] }> }): Promise<ReactElement> {
  const customer = await requireWebsiteClient();
  const { page: requested } = await searchParams;
  const { bots, leads, total, lastWeek, lastMonth, page, pageCount } = await loadLeadsPage(customer, readPageParam(requested));
  if (bots.length === 0) return <NoAssistantYet />;

  // Message counts come from OyeChats itself. A bot without a key, or OyeChats being down, only means the
  // count shows a dash: the leads Brandbasket already holds are listed regardless.
  const activity = total === 0 ? new Map() : await loadBotActivity(bots);
  const rows = buildLeadRows(leads, activity, new Map(bots.map((bot) => [bot.id, bot.name] as const)));

  return (
    <PageColumns
      main={
        <>
          <LeadFigures total={total} lastWeek={lastWeek} lastMonth={lastMonth} />
          <PageSection id="leads" title="Leads" aside={<span className="tabular-nums">{total === 1 ? "1 lead" : `${total} leads`}</span>}>
            {total === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="No leads yet"
                text="When a visitor leaves their details in your chatbot, they appear here with the conversation they had."
              />
            ) : (
              <>
                <LeadTable rows={rows} showBot={bots.length > 1} firstNumber={(page - 1) * LEADS_PER_PAGE + 1} />
                <LeadPagination page={page} pageCount={pageCount} perPage={LEADS_PER_PAGE} total={total} />
              </>
            )}
          </PageSection>
        </>
      }
      aside={
        <>
          <ChatbotPanel bots={bots} />
          <OyeChatsHelp />
        </>
      }
    />
  );
}
