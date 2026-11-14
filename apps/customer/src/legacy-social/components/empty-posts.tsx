"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import type { PostingDays } from "@/legacy-social/lib/social/schedule";
import { StartDialog } from "./ai-start-card";
import { SMALL_DARK } from "./small-buttons";

interface EmptyPostsProps {
  /** The channel being looked at, or all of them. */
  readonly channel: "all" | ChannelPlatform;
  /** The channels with an account connected. */
  readonly connected: readonly ChannelPlatform[];
  readonly website: string | null;
  readonly postingDays: PostingDays | null;
  readonly canChange: boolean;
}

/**
 * What the Posts tab says when there is nothing to look over, so it is never a blank page: what is missing (an account, a website, the
 * posts themselves) and the one thing to do next.
 */
export function EmptyPosts({ channel, connected, website, postingDays, canChange }: EmptyPostsProps): ReactElement {
  const [writing, setWriting] = useState(false);
  const name = channel === "all" ? null : PLATFORM_NAMES[channel];
  const view = ((): { title: string; text: string; action: ReactElement | null } => {
    if (connected.length === 0) {
      return { title: "Connect an account first", text: "Connect Instagram, Facebook, LinkedIn or Google on the left. Posts are written for the accounts you connect, and you look them over here.", action: null };
    }
    if (website === null) {
      return {
        title: "Add your website first",
        text: "We write your posts from your website: what you sell and how you sound. Add it in your business profile, then come back here to start your posts.",
        action: (
          <Link href="/business" className={SMALL_DARK}>
            Open business profile
          </Link>
        ),
      };
    }
    return {
      title: name === null ? "No posts to look over yet" : `No posts for ${name} yet`,
      text: `We read your website once and write posts${name === null ? "" : ` for ${name}`}. You keep the ones you like, then approve the pictures. Nothing is drawn or posted until you say so.`,
      action: canChange ? (
        <button type="button" onClick={() => setWriting(true)} className={SMALL_DARK}>
          Write my posts
        </button>
      ) : null,
    };
  })();
  return (
    <section aria-labelledby="empty-posts-title" className={`${LIFT} grid gap-3 p-5`}>
      <h2 id="empty-posts-title" className={SECTION_TITLE}>
        {view.title}
      </h2>
      <p className="max-w-prose text-[0.84375rem] leading-relaxed text-ink-2">{view.text}</p>
      {view.action === null ? null : <div className="flex">{view.action}</div>}
      {writing && website !== null ? <StartDialog connected={new Set<ChannelPlatform>(channel === "all" ? connected : [channel])} postingDays={postingDays} website={website} onClose={() => setWriting(false)} /> : null}
    </section>
  );
}
