import type { SiteHealthFacts } from "@brandbasket/db";
import { PanelData } from "@/components";
import type { Loaded } from "@/lib/loaded";
import { Badge, Icon } from "@/ui";
import { siteHealthRows } from "../rules/health";

/** Site health on the live Website page (mock: screens-b.js, Website): up or down, uptime, the secure connection, phone speed. */
export function SiteHealthPanel({ facts, now }: { readonly facts: Loaded<SiteHealthFacts>; readonly now: Date }) {
  return (
    <PanelData
      title="Site health"
      data={facts}
      what="your site health"
      flush
      isEmpty={(data) => siteHealthRows(data, now).length === 0}
      empty={{ icon: "ShieldCheck", title: "No checks yet", description: "Checks start once your website is live." }}
    >
      {(data) => (
        <ul className="m-0 list-none p-0">
          {siteHealthRows(data, now).map((row) => (
            <li key={row.key} className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
              <Icon name={row.icon} className="text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="type-sub text-ink">{row.title}</p>
                {row.line === null ? null : <p className="type-meta">{row.line}</p>}
              </div>
              {row.badge === null ? null : <Badge tone={row.badge.tone}>{row.badge.text}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </PanelData>
  );
}
