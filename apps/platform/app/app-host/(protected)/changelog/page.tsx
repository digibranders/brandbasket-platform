import type { Metadata } from "next";
import type { ReactElement } from "react";
import { PageFrame } from "@/components/v2/page";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";

export const metadata: Metadata = { title: "What’s new" };

/** What changed in the dashboard, newest first: a date, a title and a few plain words. Rows split by hairlines, no cards. */
export default function ChangelogPage(): ReactElement {
  return (
    <PageFrame title="What’s new" lede="What we have changed in your dashboard.">
      <ol className="divide-y divide-line border-y border-line">
        {CHANGELOG_ENTRIES.map((entry, index) => (
          <li key={`${entry.date}-${entry.title}`} className="grid gap-1 py-6 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-8">
            <p className="font-figure text-[0.8125rem] tabular-nums text-ink-2">
              <time dateTime={entry.date}>{entry.label}</time>
              {index === 0 ? <span className="ml-2 rounded-full bg-rattan-wash px-2 py-0.5 font-sans text-[0.6875rem] font-semibold text-rattan-ink">Latest</span> : null}
            </p>
            <div className="min-w-0 max-w-2xl">
              <h2 className="font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-ink">{entry.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{entry.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </PageFrame>
  );
}
