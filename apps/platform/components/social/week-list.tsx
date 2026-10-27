import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { EmptyState, PageSection } from "@/components/v2/page";
import { dueLabel, statusWord, type PostView } from "@/lib/social/week";

/** This India week's posts, one row each: the day, where the post is, its title. */
export function WeekList({ posts }: { readonly posts: readonly PostView[] }): ReactElement {
  return (
    <PageSection id="week" title="This week" flush={posts.length > 0}>
      {posts.length === 0 ? (
        <EmptyState compact icon={CalendarBlank} title="Nothing is planned for this week yet." text="Posts we plan for the week appear here." />
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((post) => (
            <li key={post.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 py-3 text-[0.84375rem]">
              <time dateTime={post.dueOn} className="font-figure text-xs tabular-nums text-ink-2">
                {dueLabel(post.dueOn)}
              </time>
              <span className="min-w-0">
                <span className={cn("block text-xs font-semibold", post.status === "planned" ? "text-ink-2" : "text-ink")}>{statusWord(post.status)}</span>
                <span className="block text-ink">{post.title}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}
