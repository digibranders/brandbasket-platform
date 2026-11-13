import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { StatusWord } from "@/components/home/status-word";
import { LIFT } from "@/components/v2/classes";
import { siteHealthRows } from "@/lib/website/health";
import type { SiteHealthFacts } from "@brandbasket/db";

/** Site health on the live Overview: up or down, uptime, the secure connection and phone speed, each only once a check measured it. */
export function SiteHealthCard({ facts, now }: { readonly facts: SiteHealthFacts; readonly now: Date }): ReactElement {
  const rows = siteHealthRows(facts, now);
  return (
    <section aria-labelledby="site-health-title" className={cn(LIFT, "grid content-start gap-4 p-5 md:p-6")}>
      <h2 id="site-health-title" className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
        Site health
      </h2>
      {rows.length === 0 ? (
        <p className="text-base text-ink-2">No checks yet. They start once your website is live.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-ink">{row.title}</p>
                {row.line === null ? null : <p className="mt-0.5 text-[0.9375rem] text-ink-2">{row.line}</p>}
              </div>
              {row.badge === null ? null : <StatusWord tone={row.badge.tone}>{row.badge.text}</StatusWord>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
