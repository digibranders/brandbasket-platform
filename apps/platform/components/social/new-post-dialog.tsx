"use client";

import { Warning } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { createPostAction, deletePostAction, sendPostNowAction, updatePostAction } from "@/app/app-host/(protected)/social/actions";
import { DARK_BUTTON, SOFT_BUTTON } from "@/components/v2/classes";
import { channelIdsOf, dayLabel, PLATFORM_NAMES, type AutoChannel, type CalendarPost } from "@/lib/social/auto";
import { canAddOn, earliestDay, latestDay, MAX_CAPTION_LENGTH, pictureProblem, POST_TIME_LABEL } from "@/lib/social/new-post";
import { ChannelLogo } from "./channel-logo";

interface NewPostDialogProps {
  /** The day the post is for (`YYYY-MM-DD`); the person can change it here. */
  readonly day: string;
  readonly onDayChange: (day: string) => void;
  /** Today in India, `YYYY-MM-DD`. */
  readonly today: string;
  /** The accounts that can be posted to. */
  readonly channels: readonly AutoChannel[];
  /** A post the business made, to change or remove; left out, the window makes a new one. */
  readonly post?: CalendarPost;
  readonly onClose: () => void;
}

interface Picked {
  readonly file: File;
  readonly url: string;
  /** Why it cannot be used, or null. */
  readonly problem: string | null;
}

const FIELD = "w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.9375rem] text-ink placeholder:text-ink-3";

/** Names in a sentence: "A", "A and B", "A, B and C". */
const listOf = (names: readonly string[]): string => (names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** A picture's width and height, read in the browser; null when it cannot be read as a picture. */
async function sizeOf(file: File): Promise<{ readonly width: number; readonly height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/**
 * The post window, a pop-up over the page when a free day is clicked (or New post is pressed): the day (it goes out at 10:00
 * that day), the accounts, a square picture and the words. The picture is stored first, then the post is made, so a picture that
 * social-auto refuses is said at once. Nothing is sent until Schedule post. Given a `post` of the business's own that has not gone
 * out, the same window changes it (a new picture is optional) or removes it. It is a native dialog, so focus stays inside it and
 * Escape closes it.
 */
export function NewPostDialog({ day, onDayChange, today, channels, post, onClose }: NewPostDialogProps): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(post === undefined ? channels.map((channel) => channel.id) : channelIdsOf(post)));
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [removing, setRemoving] = useState(false);
  const [posting, setPosting] = useState(false);
  // Set once the post has gone out (even to some accounts only): the form behind it is out of date, so it can only be closed.
  const [sent, setSent] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialog = useRef<HTMLDialogElement>(null);
  const captionField = useRef<HTMLTextAreaElement>(null);
  const url = picked?.url;

  // Open as a pop-up as soon as it is on the page, and put the cursor in the caption (again when the day is changed).
  useEffect(() => {
    const window = dialog.current;
    if (window !== null && !window.open) window.showModal();
  }, []);
  useEffect(() => {
    captionField.current?.focus({ preventScroll: true });
  }, [day]);

  // A picture's preview address is released when it is replaced and when the form closes.
  useEffect(() => (url === undefined ? undefined : () => URL.revokeObjectURL(url)), [url]);

  const toggle = (id: string): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const choose = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (file === undefined) return;
    setError(null);
    const size = await sizeOf(file);
    const problem = size === null ? "That file could not be read as a picture." : pictureProblem({ type: file.type, bytes: file.size, width: size.width, height: size.height });
    setPicked({ file, url: URL.createObjectURL(file), problem });
  };

  const problem = ((): string | null => {
    if (day !== post?.day && !canAddOn(day, today)) return `Choose a day from ${dayLabel(earliestDay(today))} to ${dayLabel(latestDay(today))}.`;
    if (selected.size === 0) return "Choose at least one account.";
    if (picked === null && post === undefined) return "Add a picture.";
    if (picked !== null && picked.problem !== null) return picked.problem;
    if (caption.trim() === "") return "Write what the post should say.";
    if (caption.length > MAX_CAPTION_LENGTH) return `The caption is ${caption.length} characters. Instagram allows ${MAX_CAPTION_LENGTH}.`;
    return null;
  })();

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (pending || problem !== null) {
      setError(problem);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        if (picked !== null) {
          const upload = await fetch("/api/social-posts/picture", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: picked.file, credentials: "same-origin" });
          const answer = (await upload.json().catch(() => null)) as { pictureId?: unknown; error?: unknown } | null;
          if (!upload.ok || typeof answer?.pictureId !== "string") {
            setError(typeof answer?.error === "string" ? answer.error : "The picture could not be uploaded. Try again.");
            return;
          }
          form.set("pictureId", answer.pictureId);
        }
        form.set("day", day);
        form.set("caption", caption);
        for (const id of selected) form.append("channel", id);
        if (post !== undefined) {
          form.set("postId", post.id);
          form.set("ownDay", post.day);
        }
        const result = await (post === undefined ? createPostAction(form) : updatePostAction(form));
        if (result.status === "error") setError(result.message);
        else onClose();
      } catch {
        setError("The post could not be saved. Check your connection and try again.");
      }
    });
  };

  // What is on screen differs from the post as saved; Post now sends the saved one, so the person saves first.
  const dirty =
    post !== undefined &&
    (caption !== post.caption || day !== post.day || picked !== null || selected.size !== channelIdsOf(post).length || channelIdsOf(post).some((id) => !selected.has(id)));
  const platformsNow = post === undefined ? [] : [...new Set(channels.filter((channel) => selected.has(channel.id)).map((channel) => PLATFORM_NAMES[channel.platform]))];

  const postNow = (): void => {
    if (pending || post === undefined) return;
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("postId", post.id);
        const result = await sendPostNowAction(form);
        if (result.status === "saved") onClose();
        else if (result.status === "partial") {
          setSent(true);
          setPosting(false);
          setError(result.message);
        } else if (result.status === "error") setError(result.message);
      } catch {
        setError("The post could not be sent. Check your connection and try again.");
      }
    });
  };

  const remove = (): void => {
    if (pending || post === undefined) return;
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.set("postId", post.id);
        const result = await deletePostAction(form);
        if (result.status === "error") setError(result.message);
        else onClose();
      } catch {
        setError("The post could not be removed. Check your connection and try again.");
      }
    });
  };

  return (
    // A click on the dimmed background lands on the dialog itself; Escape is the dialog's own cancel, so the keyboard needs nothing here.
    <dialog
      ref={dialog}
      aria-labelledby="new-post-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),40rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-[0_24px_60px_-20px_rgb(21_22_26/0.5)] backdrop:bg-[rgb(17_20_24/0.5)]"
    >
      <div className="grid gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="new-post-title" className="font-display text-[1.0625rem] font-semibold text-ink">
              {post === undefined ? "New post" : "Change post"}
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">
              {dayLabel(day, { weekday: "long", day: "numeric", month: "long" })} at {POST_TIME_LABEL}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className={SOFT_BUTTON}>
            Cancel
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid gap-1.5">
            <label htmlFor="new-post-day" className="text-sm font-semibold text-ink">
              Day
            </label>
            <input
              id="new-post-day"
              type="date"
              value={day}
              min={post !== undefined && post.day < earliestDay(today) ? post.day : earliestDay(today)}
              max={latestDay(today)}
              onChange={(event) => event.target.value !== "" && onDayChange(event.target.value)}
              className={cn(FIELD, "h-11 sm:w-56")}
            />
            <p className="text-xs text-ink-2">From tomorrow on. Every post goes out at {POST_TIME_LABEL}.</p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-ink">Post to</legend>
            <div className="flex flex-wrap gap-2">
              {channels.map((channel) => (
                <label key={channel.id} className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[0.84375rem] text-ink", selected.has(channel.id) ? "border-ink bg-surface" : "border-ink-2/40 bg-surface opacity-70")}>
                  <input type="checkbox" checked={selected.has(channel.id)} onChange={() => toggle(channel.id)} className="size-4 accent-ink" />
                  <ChannelLogo platform={channel.platform} small />
                  <span className="min-w-0 break-words">
                    {channel.account}
                    <span className="sr-only">, {PLATFORM_NAMES[channel.platform]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <label htmlFor="new-post-picture" className="text-sm font-semibold text-ink">
              {post === undefined ? "Picture" : "Picture (optional)"}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input id="new-post-picture" type="file" accept="image/jpeg" onChange={(event) => void choose(event)} className="max-w-full text-[0.84375rem] text-ink-2 file:mr-3 file:h-11 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sunken file:px-4 file:text-[0.9375rem] file:font-semibold file:text-ink" />
              {picked === null && post?.imageUrl === undefined ? null : (
                // A local preview of the chosen file (or the post's present picture), which Next's image optimiser cannot reach.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picked?.url ?? post?.imageUrl} alt={picked === null ? "The present picture" : "The chosen picture"} className="size-16 rounded-lg object-cover" />
              )}
            </div>
            <p className="text-xs text-ink-2">{post === undefined ? "A square JPG, between 320 and 4096 pixels, up to 4 MB." : "Choose a picture only to replace this one. A square JPG, between 320 and 4096 pixels, up to 4 MB."}</p>
            {picked?.problem == null ? null : (
              <p className="flex items-center gap-1.5 text-[0.84375rem] font-semibold text-error">
                <Warning size={16} weight="fill" aria-hidden="true" />
                {picked.problem}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="new-post-caption" className="text-sm font-semibold text-ink">
              Caption
            </label>
            <textarea ref={captionField} id="new-post-caption" value={caption} onChange={(event) => setCaption(event.target.value)} rows={5} className={cn(FIELD, "py-2.5 leading-relaxed")} placeholder="What should the post say?" />
            <p className={cn("text-xs", caption.length > MAX_CAPTION_LENGTH ? "font-semibold text-error" : "text-ink-2")}>
              {caption.length} of {MAX_CAPTION_LENGTH}
            </p>
          </div>

          {posting && platformsNow.length > 0 && error === null ? (
            <p className="text-[0.84375rem] text-ink-2">
              This goes out right away to {listOf(platformsNow)} and cannot be taken back.
            </p>
          ) : null}
          {error === null ? null : (
            <p role="alert" className="text-[0.84375rem] font-semibold text-error">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || sent} className={DARK_BUTTON}>
              {pending ? "Saving" : post === undefined ? "Schedule post" : "Save changes"}
            </button>
            {post === undefined || sent ? null : posting ? (
              <>
                <button type="button" onClick={postNow} disabled={pending} className={SOFT_BUTTON}>
                  Yes, post it now
                </button>
                <button type="button" onClick={() => setPosting(false)} disabled={pending} className={SOFT_BUTTON}>
                  Not yet
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setPosting(true)} disabled={pending || dirty} className={SOFT_BUTTON}>
                Post now
              </button>
            )}
            {post === undefined || sent ? null : removing ? (
              <>
                <button type="button" onClick={remove} disabled={pending} className={SOFT_BUTTON}>
                  Yes, remove it
                </button>
                <button type="button" onClick={() => setRemoving(false)} disabled={pending} className={SOFT_BUTTON}>
                  Keep it
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setRemoving(true)} disabled={pending} className={SOFT_BUTTON}>
                Remove post
              </button>
            )}
            {problem !== null && !pending ? <span className="text-xs text-ink-2">{problem}</span> : null}
            {dirty && problem === null && !pending ? <span className="text-xs text-ink-2">Save your changes first to post now.</span> : null}
          </div>
        </form>
      </div>
    </dialog>
  );
}
