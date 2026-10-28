import type { Chatbot } from "@brandbasket/db";
import type { ReactElement } from "react";
import { PageSection } from "@/components/v2/page";
import { chatbotStatusLine, OYECHATS_INCLUDED_LABEL, websiteLabel } from "@/lib/chatbots-view";
import { ChatbotName } from "./chatbot-name";

const STATUS_CHIP = {
  live: "bg-sage-wash text-sage-deep",
  setting_up: "bg-rattan-wash text-rattan-ink",
  paused: "bg-sunken text-ink-2",
} as const;

/**
 * The customer's OyeChats assistants, each with where it stands, the site it is on and the name the customer calls it, which
 * they can change. A bot has no login of its own; anything else about it goes to the team through Requests. Bots are registered by staff.
 */
export function ChatbotPanel({ bots }: { readonly bots: readonly Chatbot[] }): ReactElement {
  return (
    <PageSection id="chatbot" title="Your chatbot" aside={OYECHATS_INCLUDED_LABEL} flush>
      <ul aria-label="Your OyeChats assistants" className="divide-y divide-line">
        {bots.map((bot) => {
          const status = chatbotStatusLine(bot.status);
          const site = websiteLabel(bot.websiteUrl);
          return (
            <li key={bot.id} className="grid gap-2 py-4">
              <div className="flex items-start justify-between gap-3">
                <ChatbotName chatbotId={bot.id} name={bot.name} />
                <p className={`inline-flex w-fit shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[bot.status]}`}>{status.label}</p>
              </div>
              {site === null ? null : <p className="font-figure text-xs text-ink-2">{site}</p>}
              <p className="text-[0.8125rem] leading-relaxed text-ink-2">{status.detail}</p>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
