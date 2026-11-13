import { Badge } from "@/ui";
import { CHANGELOG_ENTRIES } from "../entries";

/** What changed, newest first: a date, a title and a few plain words. Only the newest row carries the Latest badge. */
export function ChangelogList() {
  return (
    <ol className="divide-y divide-border-subtle">
      {CHANGELOG_ENTRIES.map((entry, index) => (
        <li key={`${entry.date}-${entry.title}`} className="grid gap-1 p-4 md:grid-cols-4 md:gap-6">
          <p className="flex items-center gap-2 type-meta md:col-span-1">
            <time dateTime={entry.date} className="whitespace-nowrap">
              {entry.label}
            </time>
            {index === 0 ? <Badge tone="accent">Latest</Badge> : null}
          </p>
          <div className="min-w-0 max-w-2xl md:col-span-3">
            <h2 className="type-sub">{entry.title}</h2>
            <p className="mt-1 type-body text-ink-2">{entry.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
