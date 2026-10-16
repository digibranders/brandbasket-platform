import type { Metadata } from "next";
import type { ReactElement } from "react";
import { ChatbotName } from "@/components/panel/oyechats/chatbot-name";
import { NoAssistantYet, OyeChatsIntro } from "@/components/panel/oyechats/oyechats-intro";
import { chatbotStatusLine, websiteLabel } from "@/lib/chatbots-view";
import { loadChatbots } from "@/lib/server/chatbots";
import { requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = { title: "OyeChats chatbot name" };

/**
 * The customer's OyeChats assistants, each with where it stands and the name the customer calls it, which they can change.
 * A bot has no login of its own; anything else about it goes to the team through Support. Bots are registered by staff.
 */
export default async function OyeChatsNamePage(): Promise<ReactElement> {
  const customer = await requireCustomerAccess();
  const bots = await loadChatbots(customer);

  return (
    <>
      <h1 className="panel-title">Chatbot name</h1>
      <OyeChatsIntro />

      {bots.length === 0 ? (
        <NoAssistantYet />
      ) : (
        <ul aria-label="Your OyeChats assistants" className="mt-8 max-w-3xl divide-y divide-line border-y border-line">
          {bots.map((bot) => {
            const status = chatbotStatusLine(bot.status);
            const site = websiteLabel(bot.websiteUrl);
            return (
              <li key={bot.id} className="flex flex-col gap-3 py-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <ChatbotName chatbotId={bot.id} name={bot.name} />
                  {site === null ? null : <p className="mt-1 text-sm text-ink-soft">{site}</p>}
                  <p className="mt-2 max-w-md text-sm text-ink-soft">{status.detail}</p>
                </div>
                <p
                  className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-sm font-medium ${
                    bot.status === "live" ? "bg-success/10 text-success" : "bg-paper-deep text-ink-soft"
                  }`}
                >
                  {status.label}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
