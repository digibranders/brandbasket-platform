import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { StatusWord } from "@/components/home/status-word";
import { LIFT } from "@/components/v2/classes";
import { REQUESTS_PATH } from "@/lib/requests/links";
import type { RecentChange } from "@/lib/website/history";

/** The live Overview's list of what the customer asked us to change, newest first, each with where it stands. */
export function RecentChangesCard({ changes }: { readonly changes: readonly RecentChange[] }): ReactElement {
  return (
    <section aria-labelledby="recent-changes-title" className={cn(LIFT, "grid content-start gap-4 p-5 md:p-6")}>
      <div className="grid gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="recent-changes-title" className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">
            Recent changes
          </h2>
          <Link href={REQUESTS_PATH} className="text-[0.9375rem] font-semibold text-ink underline underline-offset-[3px]">
            All requests
          </Link>
        </div>
        <p className="text-[0.9375rem] text-ink-2">Everything you asked us to change, and where it stands.</p>
      </div>
      {changes.length === 0 ? (
        <p className="text-base text-ink-2">Nothing yet. Ask for a change any time.</p>
      ) : (
        <ul className="divide-y divide-line">
          {changes.map((change) => (
            <li key={change.ticketId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="break-words text-base font-semibold text-ink">{change.title}</p>
                <p className="mt-0.5 break-words text-[0.9375rem] text-ink-2">
                  {change.page === null ? null : <>{change.page} &middot; </>}
                  asked {change.asked}
                </p>
              </div>
              <StatusWord tone={change.tone}>{change.word}</StatusWord>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
