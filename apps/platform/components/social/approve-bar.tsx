"use client";

import { Check } from "@phosphor-icons/react/dist/ssr";
import { useFormStatus } from "react-dom";
import type { ReactElement } from "react";
import { approvePostsAction } from "@/app/app-host/(protected)/social/actions";
import { DARK_BUTTON } from "@/components/v2/classes";
import { approveAllLabel, type PostView } from "@/lib/social/week";

function ApproveButton({ count }: { readonly count: number }): ReactElement {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={DARK_BUTTON}>
      <Check size={16} weight="bold" aria-hidden="true" />
      {approveAllLabel(count)}
    </button>
  );
}

/**
 * Approves exactly the posts on screen: one hidden id per post, and the page's one dark button. On phones it is pinned
 * above the tab bar (the same offset the live preview's save bar uses); from `lg` it sits under the cards.
 */
export function ApproveBar({ posts }: { readonly posts: readonly PostView[] }): ReactElement {
  return (
    <form
      action={approvePostsAction}
      className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-10 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface px-4 py-3 sm:-mx-5 sm:-mb-5 sm:px-5 lg:static lg:m-0 lg:border-t-0 lg:bg-transparent lg:p-0"
    >
      {posts.map((post) => (
        <input key={post.id} type="hidden" name="ids" value={post.id} />
      ))}
      <p className="text-[0.8125rem] text-ink-2">Nothing goes out until you approve it.</p>
      <ApproveButton count={posts.length} />
    </form>
  );
}
