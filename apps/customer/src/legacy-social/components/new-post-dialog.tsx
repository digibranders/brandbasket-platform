"use client";

import { Check, Warning, X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { createPostAction, deletePostAction, sendPostNowAction, updatePostAction } from "@/legacy-social/actions";
import { CAPTION_HINTS, CHANNEL_PLATFORMS, channelIdsOf, dayLabel, time12, PLATFORM_NAMES, type AutoChannel, type CalendarPost, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { canAddOn, earliestDay, isTime, latestDay, MAX_CAPTION_LENGTH, momentHasPassed, pictureProblem } from "@/legacy-social/lib/social/new-post";
import { postPictureSrc } from "@/legacy-social/lib/social/post-picture";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";

interface NewPostDialogProps {
  /** The day the post is for (`YYYY-MM-DD`); the person can change it here. */
  readonly day: string;
  readonly onDayChange: (day: string) => void;
  /** The time to start with (`HH:MM`, India time); the person can change it here. A post being changed starts at its own. */
  readonly time: string;
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

const FIELD = "w-full rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink placeholder:text-ink-3";

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
export function NewPostDialog({ day, onDayChange, time: startTime, today, channels, post, onClose }: NewPostDialogProps): ReactElement {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(post === undefined ? channels.map((channel) => channel.id) : channelIdsOf(post)));
  const [caption, setCaption] = useState(post?.caption ?? "");
  // A caption of their own for single networks: the text typed for each, and whether the boxes are open at all.
  const [own, setOwn] = useState<Readonly<Partial<Record<ChannelPlatform, string>>>>(() => post?.variants ?? {});
  const [customize, setCustomize] = useState(() => Object.keys(post?.variants ?? {}).length > 0);
  const [previewOf, setPreviewOf] = useState<ChannelPlatform | null>(null);
  const [time, setTime] = useState(post?.time ?? startTime);
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

  const selectedChannels = channels.filter((channel) => selected.has(channel.id));
  const platformsSelected = CHANNEL_PLATFORMS.filter((platform) => selectedChannels.some((channel) => channel.platform === platform));
  // What a network posts: its own caption when the boxes are open and it has one, otherwise the main caption.
  const captionFor = (platform: ChannelPlatform): string => (customize ? (own[platform] ?? caption) : caption);
  const sentVariants = (): Partial<Record<ChannelPlatform, string>> =>
    Object.fromEntries(platformsSelected.flatMap((platform) => (customize && captionFor(platform).trim() !== "" && captionFor(platform).trim() !== caption.trim() ? [[platform, captionFor(platform).trim()]] : []))) as Partial<Record<ChannelPlatform, string>>;
  const previewPlatform = customize && previewOf !== null && platformsSelected.includes(previewOf) ? previewOf : null;
  const previewCaption = previewPlatform === null ? caption : captionFor(previewPlatform);

  const problem = ((): string | null => {
    if (!isTime(time)) return "Choose a time, like 14:30.";
    if (!(post?.day === day && post.time === time) && momentHasPassed(day, time, new Date())) return "That time has already passed. Choose a later time.";
    if (day !== post?.day && !canAddOn(day, today)) return `Choose a day from ${dayLabel(earliestDay(today))} to ${dayLabel(latestDay(today))}.`;
    if (selected.size === 0) return "Choose at least one account.";
    if (picked === null && post === undefined) return "Add a picture.";
    if (picked !== null && picked.problem !== null) return picked.problem;
    if (caption.trim() === "") return "Write what the post should say.";
    if (caption.length > MAX_CAPTION_LENGTH) return `The caption is ${caption.length} characters. Instagram allows ${MAX_CAPTION_LENGTH}.`;
    const tooLong = platformsSelected.find((platform) => captionFor(platform).length > MAX_CAPTION_LENGTH);
    if (tooLong !== undefined) return `The ${PLATFORM_NAMES[tooLong]} caption is ${captionFor(tooLong).length} characters. The limit is ${MAX_CAPTION_LENGTH}.`;
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
        form.set("time", time);
        form.set("caption", caption);
        for (const id of selected) form.append("channel", id);
        // Only a network with a caption of its own is named; the others follow the main caption. A network that had one and lost it is put back by the server.
        if (customize) for (const platform of platformsSelected) form.set(`caption_${platform}`, captionFor(platform));
        if (post !== undefined) {
          form.set("postId", post.id);
          form.set("ownDay", post.day);
          form.set("ownTime", post.time);
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
    (caption !== post.caption || JSON.stringify(CHANNEL_PLATFORMS.map((platform) => sentVariants()[platform] ?? null)) !== JSON.stringify(CHANNEL_PLATFORMS.map((platform) => post.variants?.[platform] ?? null)) || day !== post.day || time !== post.time || picked !== null || selected.size !== channelIdsOf(post).length || channelIdsOf(post).some((id) => !selected.has(id)));
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

  const previewPicture = picked?.url ?? (post?.imageUrl === undefined ? undefined : postPictureSrc(post.imageUrl));

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
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),52rem)] overflow-y-auto rounded-2xl border-0 bg-surface p-0 text-ink shadow-dialog backdrop:bg-scrim"
    >
      <form onSubmit={submit} noValidate className="grid gap-5 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="new-post-title" className="type-section text-ink">
              {post === undefined ? "New post" : "Edit post"}
            </h3>
            <p className="mt-1 text-[0.84375rem] text-ink-2">
              {dayLabel(day, { weekday: "long", day: "numeric", month: "long" })}
              {isTime(time) ? ` at ${time12(time)}` : ""}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={pending} className="grid size-9 shrink-0 place-items-center rounded-lg text-ink-2 hover:bg-sunken">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-5">
            <div>
              <div className="flex flex-wrap gap-3">
                <div className="grid gap-1.5">
                  <label htmlFor="new-post-day" className="text-xs font-semibold text-ink-2">
                    Day
                  </label>
                  <input
                    id="new-post-day"
                    type="date"
                    value={day}
                    min={post !== undefined && post.day < earliestDay(today) ? post.day : earliestDay(today)}
                    max={latestDay(today)}
                    onChange={(event) => event.target.value !== "" && onDayChange(event.target.value)}
                    className={cn(FIELD, "h-10 w-40")}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="new-post-time" className="text-xs font-semibold text-ink-2">
                    Time
                  </label>
                  <input id="new-post-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className={cn(FIELD, "h-10 w-32")} />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-ink-3">India time. It goes out within a few minutes of the time you choose.</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-ink-2">Post to</legend>
              <div className="flex flex-wrap gap-2.5">
                {channels.map((channel) => {
                  const on = selected.has(channel.id);
                  return (
                    <label key={channel.id} title={`${channel.account}, ${PLATFORM_NAMES[channel.platform]}`} className="relative cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => toggle(channel.id)} className="peer sr-only" />
                      <span className={cn("block rounded-xl ring-2 ring-offset-2 ring-transparent transition peer-focus-visible:ring-ink", !on && "opacity-40")}>
                        <ChannelLogo platform={channel.platform} />
                      </span>
                      {on ? (
                        <span aria-hidden="true" className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-ok text-surface">
                          <Check size={10} weight="bold" />
                        </span>
                      ) : null}
                      <span className="sr-only">
                        {channel.account}, {PLATFORM_NAMES[channel.platform]}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-3">
                {selected.size === channels.length ? "All accounts" : `${selected.size} of ${channels.length} accounts`}
                {selectedChannels.length > 0 && selectedChannels.length < 4 ? `: ${selectedChannels.map((channel) => channel.account).join(", ")}` : ""}
              </p>
              {channels.some((channel) => channel.platform === "google" && selected.has(channel.id)) ? (
                <p className="mt-1 text-xs text-ink-3">Google Business leaves out hashtags and shortens text over 1,500 characters.</p>
              ) : null}
            </fieldset>

            <div className="grid gap-1.5">
              <label htmlFor="new-post-caption" className="text-xs font-semibold text-ink-2">
                Caption
              </label>
              <textarea ref={captionField} id="new-post-caption" value={caption} onChange={(event) => setCaption(event.target.value)} rows={6} className={cn(FIELD, "py-2.5 leading-relaxed")} placeholder="What should the post say?" />
              <p className={cn("text-xs", caption.length > MAX_CAPTION_LENGTH ? "font-semibold text-error" : "text-ink-3")}>
                {caption.length} of {MAX_CAPTION_LENGTH}
              </p>
              {platformsSelected.length > 1 ? (
                <label className="mt-1 flex cursor-pointer items-center gap-2 text-[0.84375rem] text-ink">
                  <input type="checkbox" checked={customize} onChange={(event) => setCustomize(event.target.checked)} className="size-4 accent-ink" />
                  Write a different caption for each network
                </label>
              ) : null}
            </div>
            {customize && platformsSelected.length > 1
              ? platformsSelected.map((platform) => {
                  const text = captionFor(platform);
                  const same = text.trim() === caption.trim();
                  return (
                    <div key={platform} className="grid gap-1.5">
                      <label htmlFor={`new-post-caption-${platform}`} className="flex items-center gap-2 text-xs font-semibold text-ink-2">
                        <ChannelLogo platform={platform} small />
                        {PLATFORM_NAMES[platform]} caption
                      </label>
                      <textarea
                        id={`new-post-caption-${platform}`}
                        value={text}
                        onChange={(event) => setOwn((current) => ({ ...current, [platform]: event.target.value }))}
                        onFocus={() => setPreviewOf(platform)}
                        rows={platform === "linkedin" ? 7 : 4}
                        className={cn(FIELD, "py-2.5 leading-relaxed")}
                      />
                      <p className={cn("text-xs", text.length > MAX_CAPTION_LENGTH ? "font-semibold text-error" : "text-ink-3")}>
                        {text.length} of {MAX_CAPTION_LENGTH}. {same ? "Same as the main caption." : "Its own caption."} {CAPTION_HINTS[platform]}
                      </p>
                    </div>
                  );
                })
              : null}
          </div>

          <div className="grid content-start gap-3">
            <p className="text-xs font-semibold text-ink-2">Preview</p>
            <div className="grid gap-3 rounded-xl border border-line p-3">
              <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-sunken">
                {previewPicture === undefined ? (
                  <span className="px-4 text-center text-[0.84375rem] text-ink-3">Add a picture to see the post</span>
                ) : (
                  // A local preview of the chosen file (or the post's present picture), which Next's image optimiser cannot reach.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewPicture} alt={picked === null ? "The present picture" : "The chosen picture"} className="size-full object-cover" />
                )}
              </div>
              {customize && platformsSelected.length > 1 ? (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Preview as">
                  {[null, ...platformsSelected].map((platform) => (
                    <button key={platform ?? "main"} type="button" onClick={() => setPreviewOf(platform)} aria-pressed={previewPlatform === platform} className={cn("rounded-lg border px-2.5 py-1 text-xs font-semibold", previewPlatform === platform ? "border-ink bg-ink text-surface" : "border-line text-ink-2")}>
                      {platform === null ? "Main" : PLATFORM_NAMES[platform]}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="line-clamp-4 whitespace-pre-wrap break-words text-[0.84375rem] leading-snug text-ink">{previewCaption.trim() === "" ? "Your words appear here." : previewCaption}</p>
              {selectedChannels.length === 0 ? null : (
                <div className="flex flex-wrap gap-1.5" aria-hidden="true">
                  {selectedChannels.map((channel) => (
                    <ChannelLogo key={channel.id} platform={channel.platform} small />
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input id="new-post-picture" type="file" accept="image/jpeg" onChange={(event) => void choose(event)} className="peer sr-only" />
              <label htmlFor="new-post-picture" className={cn(SMALL_SOFT, "cursor-pointer peer-focus-visible:ring-2 peer-focus-visible:ring-ink")}>
                {previewPicture === undefined ? "Choose a picture" : "Replace picture"}
              </label>
              <span className="text-xs text-ink-3">A square JPG, 320 to 4096 pixels, up to 4 MB.</span>
            </div>
            {picked?.problem == null ? null : (
              <p className="flex items-center gap-1.5 text-[0.84375rem] font-semibold text-error">
                <Warning size={16} weight="fill" aria-hidden="true" />
                {picked.problem}
              </p>
            )}
          </div>
        </div>

        {posting && platformsNow.length > 0 && error === null ? (
          <p className="text-[0.84375rem] text-ink-2">This goes out right away to {listOf(platformsNow)} and cannot be taken back.</p>
        ) : null}
        {error === null ? null : (
          <p role="alert" className="text-[0.84375rem] font-semibold text-error">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <button type="submit" disabled={pending || sent} className={SMALL_DARK}>
            {pending ? "Saving" : post === undefined ? "Schedule post" : "Save changes"}
          </button>
          {post === undefined || sent ? null : posting ? (
            <>
              <button type="button" onClick={postNow} disabled={pending} className={SMALL_SOFT}>
                Yes, post it now
              </button>
              <button type="button" onClick={() => setPosting(false)} disabled={pending} className={SMALL_SOFT}>
                Not yet
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setPosting(true)} disabled={pending || dirty} className={SMALL_SOFT}>
              Post now
            </button>
          )}
          {problem !== null && !pending ? <span className="text-xs text-ink-3">{problem}</span> : null}
          {dirty && problem === null && !pending ? <span className="text-xs text-ink-3">Save your changes first to post now.</span> : null}
          {post === undefined || sent ? null : removing ? (
            <span className="ml-auto flex items-center gap-3">
              <button type="button" onClick={remove} disabled={pending} className="text-[0.84375rem] font-semibold text-error underline">
                Yes, remove it
              </button>
              <button type="button" onClick={() => setRemoving(false)} disabled={pending} className="text-[0.84375rem] font-semibold text-ink-2 underline">
                Keep it
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setRemoving(true)} disabled={pending} className="ml-auto text-[0.84375rem] font-semibold text-error underline">
              Remove post
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
