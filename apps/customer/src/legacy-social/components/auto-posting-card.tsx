"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { setAutoPostingAction } from "@/legacy-social/actions";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { AUTO_POSTING_CONSENT, AUTO_SAFETY_HOURS, safetyWords, type AutoPosting } from "@/legacy-social/lib/social/auto-posting";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

interface AutoPostingCardProps {
  readonly auto: AutoPosting;
  /** The connected channels with their account names, in the order they are shown. */
  readonly channels: readonly { readonly platform: ChannelPlatform; readonly account: string }[];
  /** Owners and editors may choose; a viewer only reads. */
  readonly canChange: boolean;
}

const names = (list: readonly ChannelPlatform[]): string => list.map((platform) => PLATFORM_NAMES[platform]).join(" and ");

/**
 * Lets the customer choose which channels the system posts for by itself. For those, pictures that passed every check are approved a set
 * time before posting and she can still reject one before it goes out; the others stay as they are, and a channel she connects later
 * starts as "you approve each post" and is offered here again.
 */
export function AutoPostingCard({ auto, channels, canChange }: AutoPostingCardProps): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<ChannelPlatform>>(new Set(auto.channels));
  const [agreed, setAgreed] = useState(false);
  const save = useReviewAction();
  if (channels.length === 0) return null;

  const connected = channels.map((channel) => channel.platform);
  const live = auto.channels.filter((platform) => connected.includes(platform));
  const manual = connected.filter((platform) => !live.includes(platform));
  // A customer who has chosen before is asked again about a channel she connected since.
  const asked = auto.consentedAt === null ? [] : auto.needsChoice.filter((platform) => connected.includes(platform));
  const toggle = (platform: ChannelPlatform): void =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  const submit = (list: readonly ChannelPlatform[]): void => {
    if (save.pending) return;
    save.run(setAutoPostingAction, { channels: list.join(","), hours: String(AUTO_SAFETY_HOURS), ...(list.length > 0 ? { agreed: "yes" } : {}) }, () => {
      setOpen(false);
      setAgreed(false);
    });
  };
  const ordered = connected.filter((platform) => chosen.has(platform));

  return (
    <section aria-labelledby="auto-posting-title" className={cn(LIFT, "grid gap-4 p-5")}>
      <div className="min-w-0">
        <h2 id="auto-posting-title" className={SECTION_TITLE}>
          Automatic posting
        </h2>
        <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">
          {live.length === 0
            ? "You approve every post before it goes out. You can let us do it for the channels you choose: we approve the pictures that pass our checks as soon as they are drawn, and you can still reject any post until it goes out."
            : `Automatic for ${names(live)}. We approve pictures ${safetyWords(auto.safetyHours)}, and you can still reject a post until it goes out.${manual.length > 0 ? ` ${names(manual)}: you approve each post.` : ""}`}
        </p>
      </div>

      {asked.length > 0 && !open ? (
        <p role="status" className="rounded-lg bg-warn-wash px-3 py-2 text-[0.84375rem] font-semibold text-warn">
          You connected {names(asked)} since you chose. {asked.length === 1 ? "It posts" : "They post"} only after you approve each post. Make {asked.length === 1 ? "it" : "them"} automatic too?
        </p>
      ) : null}

      {!canChange ? null : !open ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setChosen(new Set([...auto.channels, ...asked]));
              setAgreed(false);
              setOpen(true);
            }}
            className={SMALL_DARK}
          >
            {live.length === 0 ? "Choose channels" : "Change"}
          </button>
          {live.length === 0 ? null : (
            <button type="button" disabled={save.pending} onClick={() => submit([])} className={SMALL_SOFT}>
              {save.pending ? "Saving" : "Switch off"}
            </button>
          )}
        </div>
      ) : (
        <form
          aria-label="Choose automatic posting"
          onSubmit={(event) => {
            event.preventDefault();
            if (ordered.length === 0 || !agreed) return;
            submit(ordered);
          }}
          className="grid gap-4"
        >
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-xs font-semibold text-ink-2">Post by itself for</legend>
            {channels.map((channel) => (
              <label key={channel.platform} className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-2">
                <input type="checkbox" checked={chosen.has(channel.platform)} onChange={() => toggle(channel.platform)} className="size-4" />
                <ChannelLogo platform={channel.platform} small />
                <span className="min-w-0 text-[0.84375rem] font-semibold text-ink">
                  {PLATFORM_NAMES[channel.platform]}
                  <span className="ml-1.5 font-normal text-ink-3">{channel.account}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-ink-3">Carousels, topics you ask for yourself, and anything our checks flag stay with you to approve.</p>
          <label className="flex cursor-pointer items-start gap-3 text-[0.84375rem] text-ink-2">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 size-4 shrink-0" />
            <span>{AUTO_POSTING_CONSENT}</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={save.pending || ordered.length === 0 || !agreed} className={SMALL_DARK}>
              {save.pending ? "Saving" : "Save"}
            </button>
            <button type="button" disabled={save.pending} onClick={() => setOpen(false)} className={SMALL_SOFT}>
              Cancel
            </button>
          </div>
          {ordered.length === 0 ? <p className="text-xs text-ink-3">Choose at least one channel, or use Cancel and Switch off.</p> : null}
          {save.error === null ? null : (
            <p role="alert" className="text-[0.84375rem] font-semibold text-error">
              {save.error}
            </p>
          )}
        </form>
      )}
      {open || save.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {save.error}
        </p>
      )}
    </section>
  );
}
