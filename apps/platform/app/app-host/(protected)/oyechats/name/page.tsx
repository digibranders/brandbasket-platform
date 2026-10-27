import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ChatbotName } from "@/components/panel/oyechats/chatbot-name";
import { NoAssistantYet, OyeChatsHelp } from "@/components/panel/oyechats/oyechats-intro";
import { PageColumns, PageSection } from "@/components/v2/page";
import { chatbotStatusLine, OYECHATS_INCLUDED_LABEL, websiteLabel } from "@/lib/chatbots-view";
import { loadChatbots } from "@/lib/server/chatbots";
import { requireWebsiteClient } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "OyeChats chatbot name" };

const STATUS_CHIP = {
  live: "bg-sage-wash text-sage-deep",
  setting_up: "bg-rattan-wash text-rattan-ink",
  paused: "bg-sunken text-ink-2",
} as const;

/**
 * The customer's OyeChats assistants, each with where it stands and the name the customer calls it, which they can change.
 * A bot has no login of its own; anything else about it goes to the team through Support. Bots are registered by staff.
 */
export default async function OyeChatsNamePage(): Promise<ReactElement> {
  const customer = await requireWebsiteClient();
  const bots = await loadChatbots(customer);
  if (bots.length === 0) return <NoAssistantYet />;

  return (
    <PageColumns
      main={
        <PageSection id="chatbots" title="Your chatbot" aside={OYECHATS_INCLUDED_LABEL} flush>
          <ul aria-label="Your OyeChats assistants" className="divide-y divide-line">
            {bots.map((bot) => {
              const status = chatbotStatusLine(bot.status);
              const site = websiteLabel(bot.websiteUrl);
              return (
                <li key={bot.id} className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <ChatbotName chatbotId={bot.id} name={bot.name} />
                    {site === null ? null : <p className="mt-1 font-figure text-xs text-ink-2">{site}</p>}
                    <p className="mt-2 max-w-md text-[0.8125rem] leading-relaxed text-ink-2">{status.detail}</p>
                  </div>
                  <p className={`inline-flex w-fit shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[bot.status]}`}>{status.label}</p>
                </li>
              );
            })}
          </ul>
        </PageSection>
      }
      aside={<OyeChatsHelp />}
    />
  );
}
