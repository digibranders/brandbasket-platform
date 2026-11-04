"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { ASK_FOR_A_CHANGE_PATH } from "@/lib/requests/links";
import { dayLabel, PLATFORM_NAMES, postStatus, time12, type CalendarPost } from "@/lib/social/auto";
import { ChannelLogo } from "./channel-logo";

interface PostDetailsDialogProps {
  readonly post: CalendarPost;
  readonly onClose: () => void;
}

/** What to say about whether the customer can change this post, in plain words. */
function changeNote(post: CalendarPost): string {
  if (post.state === "skipped") return "This post was skipped, so it will not be sent.";
  if (post.state === "paused") return "This post is paused, so it is not going out right now. It goes out when the pause ends, unless its time comes first.";
  if (!post.manual) return "We wrote this post for you. To change it, ask us and we will.";
  if (post.state === "published") return "This post has gone out, so it can no longer be changed.";
  if (post.state === "missed") return "This post could not be sent to every account, so it can no longer be changed.";
  return "This post is going out now, so it can no longer be changed.";
}

/** A link to the post on its network, only when it is a plain https address. */
const safeLink = (value: string | null): string | null => (value !== null && value.startsWith("https://") ? value : null);

/**
 * A post the customer cannot change, opened to read: the day and time, how it is doing on each account, the picture and the
 * words. It is a native dialog, so focus stays inside it and Escape closes it.
 */
export function PostDetailsDialog({ post, onClose }: PostDetailsDialogProps): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const window = dialog.current;
    if (window !== null && !window.open) window.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="post-details-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),36rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="post-details-title" className="font-display text-[1.0625rem] font-semibold text-ink">
              Post
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">
              {dayLabel(post.day, { weekday: "long", day: "numeric", month: "long" })} at {time12(post.time)}
            </p>
          </div>
          <button type="button" onClick={onClose} className={SOFT_BUTTON}>
            Close
          </button>
        </div>

        {post.imageUrl === undefined ? null : (
          // The post's picture, served by social-auto, which Next's image optimiser cannot reach.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt="The picture of this post" className="size-40 rounded-xl object-cover" />
        )}

        <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-ink">{post.caption}</p>

        {post.channels.length === 0 ? null : (
          <ul className="grid gap-2" aria-label="Where this post goes">
            {post.channels.map((channel) => {
              const status = postStatus({ ...post, channels: [channel] }, new Set([channel.platform]));
              const link = safeLink(channel.permalink);
              return (
                <li key={`${channel.platform}:${channel.account}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.84375rem]">
                  <ChannelLogo platform={channel.platform} small />
                  <span className="min-w-0 break-words font-semibold text-ink">
                    {channel.account}
                    <span className="sr-only">, {PLATFORM_NAMES[channel.platform]}</span>
                  </span>
                  <span className="text-ink-2">{status === null ? "" : status.word}</span>
                  {link === null ? null : (
                    <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink-2 underline">
                      View post
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[0.84375rem] text-ink-2">{changeNote(post)}</p>
        {post.manual ? null : (
          <Link href={`${ASK_FOR_A_CHANGE_PATH}?kind=social`} className={SOFT_BUTTON}>
            Ask for a change
          </Link>
        )}
      </div>
    </dialog>
  );
}
