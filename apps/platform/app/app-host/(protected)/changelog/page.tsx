import type { Metadata } from "next";
import type { ReactElement } from "react";
import { BuilderIllustration } from "@fynix/shared/ui/builder-illustration";
import { CHANGELOG_ENTRIES } from "@/lib/changelog";

export const metadata: Metadata = { title: "Changelog" };

export default function ChangelogPage(): ReactElement {
  const latestDate = CHANGELOG_ENTRIES[0]?.label;

  return (
    <div className="max-w-4xl">
      {/* Hero card featuring the builder at work */}
      <section
        aria-label="Changelog introduction"
        className="rounded-card border border-line bg-card p-6 sm:p-8 lg:p-10 shadow-xs overflow-hidden"
      >
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-xs font-medium text-ink-soft">
              <span className="size-2 rounded-full bg-accent motion-safe:animate-pulse" aria-hidden="true" />
              <span>What’s new & shipping</span>
            </div>

            <h1 className="mt-4 panel-title text-2xl sm:text-3xl text-ink">Changelog</h1>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-ink-soft">
              Every improvement, new feature, and polish we build for your dashboard. Our team continuously refines
              your website tools so running your business stays effortless.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs tabular-nums text-ink-soft">
              <span className="font-medium text-ink">{CHANGELOG_ENTRIES.length} recent updates</span>
              {latestDate === undefined ? null : (
                <>
                  <span aria-hidden="true">•</span>
                  <span>Latest: {latestDate}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <div className="relative w-full max-w-[280px] sm:max-w-[320px] text-ink drop-shadow-xs transition-transform duration-300 hover:scale-[1.02]">
              <BuilderIllustration className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      {/* Timeline of updates */}
      <div className="mt-10 sm:mt-12">
        <h2 className="panel-section mb-6 px-1">Recent releases</h2>

        <ol className="relative ml-3 sm:ml-4 border-l-2 border-line space-y-6 sm:space-y-8 pl-6 sm:pl-8">
          {CHANGELOG_ENTRIES.map((entry, index) => {
            const isLatest = index === 0;

            return (
              <li key={`${entry.date}-${entry.title}`} className="relative group">
                {/* Timeline node marker */}
                <span
                  aria-hidden="true"
                  className="absolute -left-[1.95rem] sm:-left-[2.45rem] top-5 flex size-4 sm:size-5 items-center justify-center rounded-full border-2 border-line bg-paper text-accent transition-colors group-hover:border-accent"
                >
                  <span className="size-1.5 sm:size-2 rounded-full bg-accent" />
                </span>

                {/* Entry card */}
                <article className="rounded-card border border-line bg-card p-5 sm:p-7 shadow-xs transition-all duration-200 group-hover:border-line/80 group-hover:shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <time
                      dateTime={entry.date}
                      className="text-[0.8125rem] font-semibold tabular-nums text-accent"
                    >
                      {entry.label}
                    </time>

                    {isLatest ? (
                      <span className="inline-flex items-center rounded-full bg-accent-pale px-2.5 py-0.5 text-[0.6875rem] font-semibold text-accent-deep">
                        Latest
                      </span>
                    ) : null}
                  </div>

                  <h3 className="mt-2.5 panel-section text-ink text-lg sm:text-xl">{entry.title}</h3>
                  <p className="mt-2.5 text-sm sm:text-base leading-relaxed text-ink-soft">{entry.body}</p>
                </article>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

