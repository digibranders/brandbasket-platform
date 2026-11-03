import { MetricStrip, PanelData } from "@/components";
import type { Loaded } from "@/lib/loaded";
import { formatNumber } from "@/lib/format";
import { Badge, LinkButton, type BadgeTone } from "@/ui";
import type { ChatAssistantView } from "../loader";
import { chatbotStatusLine, OYECHATS_INCLUDED_LABEL, websiteLabel } from "../rules";
import { RenameAssistant } from "./rename-assistant";

const TONES: Readonly<Record<"setting_up" | "live" | "paused", BadgeTone>> = { setting_up: "info", live: "pos", paused: "warn" };

/**
 * The customer's chatbot: where it stands, the name they call it (which they can change) and how many leads it has caught.
 * The leads themselves are in the list, under Website. Ported from apps/platform (ChatbotPanel, LeadFigures, NoAssistantYet).
 */
export function ChatAssistant({ data, canEdit }: { readonly data: Loaded<ChatAssistantView>; readonly canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {data.ok && data.data.bots.length > 0 ? (
        <MetricStrip
          label="Chat leads"
          metrics={[
            { label: "Leads in all", value: formatNumber(data.data.total) },
            { label: "Last 7 days", value: formatNumber(data.data.lastWeek) },
            { label: "Last 30 days", value: formatNumber(data.data.lastMonth) },
          ]}
        />
      ) : null}
      <PanelData
        data={data}
        title="Your chatbot"
        meta={OYECHATS_INCLUDED_LABEL}
        what="your chatbot"
        flush
        isEmpty={(view) => view.bots.length === 0}
        empty={{
          icon: "ChatCircleDots",
          title: "Your chatbot is not set up yet",
          description: "The team builds it for your business and adds it to your website. Then its status shows here, and visitors who leave their details appear in your enquiries.",
          action: <LinkButton href="/requests/new">Ask the team</LinkButton>,
        }}
      >
        {(view) => (
          <ul aria-label="Your website chat assistants" className="m-0 list-none p-0">
            {view.bots.map((bot) => {
              const status = chatbotStatusLine(bot.status);
              const site = websiteLabel(bot.websiteUrl);
              return (
                <li key={bot.id} className="flex flex-col gap-1.5 border-b border-border-subtle px-4 py-3.5 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="type-sub">{bot.name}</h3>
                    <Badge tone={TONES[bot.status]}>{status.label}</Badge>
                    <span className="flex-1" />
                    {canEdit ? <RenameAssistant chatbotId={bot.id} name={bot.name} /> : null}
                  </div>
                  {site === null ? null : <p className="type-meta">{site}</p>}
                  <p className="type-body text-ink-2">{status.detail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </PanelData>
    </div>
  );
}
