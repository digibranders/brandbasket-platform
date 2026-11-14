"use client";

import { useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { setPostingDaysAction } from "@/legacy-social/actions";
import type { ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { daysWords, WEEKDAYS, WEEKDAY_LONG, type Weekday } from "@/legacy-social/lib/social/schedule";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

interface PostingDaysProps {
  readonly platform: ChannelPlatform;
  /** The days saved for this channel; empty when it posts on the usual spread. */
  readonly days: readonly Weekday[];
  /** Owners and editors may change the days; a viewer only reads them. */
  readonly canChange: boolean;
}

/** The first letter of each day, for the seven small boxes (the full name is the box's label). */
const LETTER: Readonly<Record<Weekday, string>> = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };

/**
 * Under a connected channel: the days it posts on, and for someone who may change things a way to choose them. Each day chosen is one post
 * a week on this channel. A change starts with the next week that is written; weeks already written or drawn never move.
 */
export function PostingDays({ platform, days, canChange }: PostingDaysProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<readonly Weekday[]>(days);
  const save = useReviewAction();
  const chosen = new Set(draft);
  const toggle = (day: Weekday): void => setDraft(WEEKDAYS.filter((one) => (one === day ? !chosen.has(day) : chosen.has(one))));
  const close = (): void => setOpen(false);
  return (
    <div className="mt-1 grid gap-2 pl-[2.75rem] pr-1.5 pb-1">
      <p className="text-xs text-ink-2">
        <span className="font-semibold text-ink">Posts on</span> {daysWords(days)}
        {canChange && !open ? (
          <>
            {" "}
            <button
              type="button"
              onClick={() => {
                setDraft(days);
                setOpen(true);
              }}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Change
            </button>
          </>
        ) : null}
      </p>
      {open ? (
        <form
          aria-label={`Days ${platform} posts on`}
          onSubmit={(event) => {
            event.preventDefault();
            if (save.pending || draft.length === 0) return;
            save.run(setPostingDaysAction, { channel: platform, days: draft.join(",") }, close);
          }}
          className="-ml-[2.75rem] grid gap-2 rounded-lg bg-sunken p-2"
        >
          <p className="text-xs text-ink-2">Each day you pick is one post a week.</p>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={chosen.has(day)}
                aria-label={WEEKDAY_LONG[day]}
                title={WEEKDAY_LONG[day]}
                onClick={() => toggle(day)}
                className={cn("h-8 rounded-md border text-xs font-bold transition-colors", chosen.has(day) ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-2 hover:bg-sunken")}
              >
                {LETTER[day]}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-3">{draft.length === 0 ? "Pick at least one day, or use the usual spread." : `${draft.length} ${draft.length === 1 ? "post" : "posts"} a week. It starts with the next week we write; weeks already written do not move.`}</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={save.pending || draft.length === 0} className={SMALL_DARK}>
              {save.pending ? "Saving" : "Save days"}
            </button>
            <button type="button" disabled={save.pending} onClick={() => save.run(setPostingDaysAction, { channel: platform, days: "" }, close)} className={SMALL_SOFT}>
              Usual spread
            </button>
            <button type="button" disabled={save.pending} onClick={close} className={SMALL_SOFT}>
              Cancel
            </button>
          </div>
          {save.error === null ? null : (
            <p role="alert" className="text-xs font-semibold text-error">
              {save.error}
            </p>
          )}
        </form>
      ) : null}
    </div>
  );
}
