import { Tray } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ChatbotPanel } from "@/components/panel/oyechats/chatbot-panel";
import { NoAssistantYet, OyeChatsHelp } from "@/components/panel/oyechats/oyechats-intro";
import { SiteContactFigures } from "@/components/panel/oyechats/site-contact-figures";
import { EnquiryFigures } from "@/components/panel/enquiries/enquiry-figures";
import { EnquiryFilters } from "@/components/panel/enquiries/enquiry-filters";
import { EnquiryList } from "@/components/panel/enquiries/enquiry-list";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { EmptyState, PageColumns, PageSection } from "@/components/v2/page";
import { EXPORT_PATH, filterRows, readFilters, statusCounts } from "@/lib/enquiries/rules";
import { loadChatbots } from "@/lib/server/chatbots";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { loadEnquiries } from "@/lib/server/enquiries";
import { loadSiteContacts } from "@/lib/server/site-contacts";

export const metadata: Metadata = { title: "Enquiries" };

type Params = { readonly status?: string | string[]; readonly source?: string | string[] };

/**
 * Everyone who got in touch, in one list: website chats (OyeChats), forms, ad leads and counted taps, with the status and a
 * private note on each, Call and WhatsApp buttons, and a CSV export. A chat opens with its conversation, read from OyeChats
 * when asked for. Beside the list sit the assistant's name and status. The last 30 days are listed, plus anyone older who is
 * still waiting for a reply.
 */
export default async function EnquiriesPage({ searchParams }: { readonly searchParams: Promise<Params> }): Promise<ReactElement> {
  const customer = await requireWebsiteClient();
  const filters = readFilters(await searchParams);
  const [view, bots, contacts] = await Promise.all([loadEnquiries(customer), loadChatbots(customer), loadSiteContacts(customer.tenant, new Date())]);
  const canEdit = customer.tenant.role !== "viewer" && customer.billing.hasAccess;
  const shown = filterRows(view.rows, filters);
  const sources = new Set(view.rows.map((row) => row.sourceGroup));

  return (
    <PageColumns
      main={
        <>
          {contacts === null ? null : <SiteContactFigures contacts={contacts} />}
          <PageSection
            id="enquiries"
            title="Enquiries"
            aside={
              view.rows.length === 0 ? undefined : (
                <a href={EXPORT_PATH} download className={SOFT_BUTTON}>
                  Export CSV
                </a>
              )
            }
          >
            {view.rows.length === 0 ? (
              <EmptyState compact icon={Tray} title="No enquiries yet" text="When someone chats, fills a form, answers an ad or taps Call or WhatsApp, it appears here." />
            ) : (
              <div className="grid gap-6">
                <EnquiryFigures summary={view.summary} />
                <EnquiryFilters filters={filters} counts={statusCounts(view.rows, filters.source)} sources={sources} />
                {shown.length === 0 ? (
                  <EmptyState compact icon={Tray} title="No enquiries match" text="Try another status or source." />
                ) : (
                  <EnquiryList rows={shown} canEdit={canEdit} />
                )}
                {view.truncated ? <p className="text-[0.8125rem] text-ink-2">Only the latest enquiries are shown. Export has them all.</p> : null}
              </div>
            )}
          </PageSection>
        </>
      }
      aside={
        bots.length === 0 ? (
          <NoAssistantYet />
        ) : (
          <>
            <ChatbotPanel bots={bots} />
            <OyeChatsHelp />
          </>
        )
      }
    />
  );
}
