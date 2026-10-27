import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { SECTION_TITLE } from "@/components/v2/classes";
import { dueLabel, statusWord, type PostView } from "@/lib/social/week";

/** This India week's posts, one row each: the day, where the post is, its title. */
export function WeekList({ posts }: { readonly posts: readonly PostView[] }): ReactElement {
  return (
    <section aria-labelledby="week-title" className="grid gap-1">
      <h2 id="week-title" className={SECTION_TITLE}>
        This week
      </h2>
      {posts.length === 0 ? (
        <p className="pt-2 text-sm text-ink-2">Nothing is planned for this week yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {posts.map((post) => (
            <li key={post.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-3 py-2.5 text-[0.84375rem]">
              <time dateTime={post.dueOn} className="font-figure text-xs text-ink-2">
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
    </section>
  );
}
