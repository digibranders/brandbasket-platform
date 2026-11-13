"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactElement } from "react";
import { changeWrittenPostTimeAction } from "@/legacy-social/actions";
import { ASK_FOR_A_CHANGE_PATH } from "@/legacy-social/shims";
import { CHANNEL_PLATFORMS, dayLabel, PLATFORM_NAMES, postStatus, time12, type CalendarPost } from "@/legacy-social/lib/social/auto";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import { canAddOn, earliestDay, isTime, latestDay, momentHasPassed } from "@/legacy-social/lib/social/new-post";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";

interface PostDetailsDialogProps {
  readonly post: CalendarPost;
  readonly onClose: () => void;
}

/** What to say about whether the customer can change this post, in plain words. */
function changeNote(post: CalendarPost): string {
  if (post.state === "skipped") return "This post was skipped, so it will not be sent.";
  if (post.state === "held") return "This post is on hold because an account it goes to is not connected. Connect it again and it goes out if its time has not passed.";
  if (post.state === "paused") return "This post is paused, so it is not going out right now. It goes out when the pause ends, unless its time comes first.";
  if (!post.manual) return canChangeTime(post) ? "We wrote this post for you. You can change when it goes out. To change the words or the picture, look over your posts." : "We wrote this post for you. To change it, ask us and we will.";
  if (post.state === "published") return "This post has gone out, so it can no longer be changed.";
  if (post.state === "missed") return "This post could not be sent to every account, so it can no longer be changed.";
  return "This post is going out now, so it can no longer be changed.";
}

const FIELD = "h-10 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink";

/** Only a post we wrote that is still waiting for its time can be moved; once it is paused, skipped, due or sent it cannot. */
const canChangeTime = (post: CalendarPost): boolean => !post.manual && post.state === "scheduled" && !momentHasPassed(post.day, post.time, new Date());

/** The day and time of a post we wrote, with a button to move it: the words and picture stay as the customer approved them. */
function ChangeTime({ post }: { readonly post: CalendarPost }): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(post.day);
  const [time, setTime] = useState(post.time);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = localDateIn(BRAND_TIME_ZONE, new Date());

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending) return;
    if (!canAddOn(day, today)) return setError("Choose a day from today to 89 days ahead.");
    if (!isTime(time) || momentHasPassed(day, time, new Date())) return setError("That time has already passed. Choose a later time.");
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("postId", post.id);
        form.set("day", day);
        form.set("time", time);
        const result = await changeWrittenPostTimeAction(form);
        if (result.status === "error") return setError(result.message);
        router.refresh();
        setOpen(false);
      } catch {
        setError("The time could not be changed. Check your connection and try again.");
      }
    });
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={SMALL_SOFT}>
        Change time
      </button>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl bg-sunken p-3">
      <div className="flex flex-wrap gap-3">
        <div className="grid gap-1">
          <label htmlFor="written-post-day" className="text-xs font-semibold text-ink-2">
            Day
          </label>
          <input id="written-post-day" type="date" value={day} min={earliestDay(today)} max={latestDay(today)} onChange={(event) => event.target.value !== "" && setDay(event.target.value)} className={FIELD} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="written-post-time" className="text-xs font-semibold text-ink-2">
            Time
          </label>
          <input id="written-post-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className={FIELD} />
        </div>
      </div>
      <p className="text-xs text-ink-3">India time. It goes out within a few minutes of the time you choose.</p>
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={SMALL_DARK}>
          {pending ? "Saving" : "Save time"}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={pending} className={SMALL_SOFT}>
          Cancel
        </button>
      </div>
    </form>
  );
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
            <h3 id="post-details-title" className="type-section text-ink">
              Post
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">
              {dayLabel(post.day, { weekday: "long", day: "numeric", month: "long" })} at {time12(post.time)}
            </p>
          </div>
          <button type="button" onClick={onClose} className={SMALL_SOFT}>
            Close
          </button>
        </div>

        {post.imageUrl === undefined ? null : (
          // The post's picture, served by social-auto, which Next's image optimiser cannot reach.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.imageUrl} alt="The picture of this post" className="size-40 rounded-xl object-cover" />
        )}

        <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed text-ink">{post.caption}</p>
        {CHANNEL_PLATFORMS.flatMap((platform) => {
          const own = post.variants?.[platform];
          return own === undefined ? [] : [
            <div key={platform} className="grid gap-1">
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                <ChannelLogo platform={platform} small />
                {PLATFORM_NAMES[platform]} caption
              </p>
              <p className="whitespace-pre-wrap break-words text-[0.875rem] leading-relaxed text-ink">{own}</p>
            </div>,
          ];
        })}

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
        {canChangeTime(post) ? <ChangeTime post={post} /> : null}
        {post.manual ? null : canChangeTime(post) ? (
          <Link href={`${ASK_FOR_A_CHANGE_PATH}&kind=social`} className={SMALL_SOFT}>
            Ask for a change
          </Link>
        ) : (
          <Link href={`${ASK_FOR_A_CHANGE_PATH}&kind=social`} className={SMALL_SOFT}>
            Ask for a change
          </Link>
        )}
      </div>
    </dialog>
  );
}
