"use client";

import { Lightbulb, Repeat } from "@phosphor-icons/react/dist/ssr";
import { useState, type ReactElement, type ReactNode } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { addNetworkAction } from "@/legacy-social/review-actions";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { daysWords, type PostingDays } from "@/legacy-social/lib/social/schedule";
import { StartDialog } from "./ai-start-card";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

interface AddChannelChoiceProps {
  /** The channel being looked at, which has no posts written yet. */
  readonly channel: ChannelPlatform;
  /** The channels whose posts are already written, which this channel's posts could copy the topics of. */
  readonly writtenFor: readonly ChannelPlatform[];
  /** True when the written topics can be written again for this channel: it has no days of its own that differ from theirs. */
  readonly canCopy: boolean;
  readonly postingDays: PostingDays | null;
  /** The website the posts are written from; null before there is one, so new topics cannot be asked for. */
  readonly website: string | null;
  /** The Monday the written posts start on, so new topics cover the same weeks; null when it has passed. */
  readonly startDate: string | null;
  /** True while posts for a channel are being written, so no second request is made. */
  readonly busy: boolean;
  readonly canChange: boolean;
}

const names = (list: readonly ChannelPlatform[]): string => list.map((platform) => PLATFORM_NAMES[platform]).join(" and ");

/** One of the two ways to get posts for a channel: an icon, what it does, what it costs the customer, and its button. */
function Way({ icon, title, text, facts, disabledNote, children }: { readonly icon: ReactNode; readonly title: string; readonly text: string; readonly facts: readonly string[]; readonly disabledNote?: string; readonly children: ReactNode }): ReactElement {
  return (
    <article className={cn("grid content-start gap-3 rounded-xl p-4 ring-1", disabledNote === undefined ? "bg-surface ring-line" : "bg-sunken ring-line")}>
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-on-primary">
          {icon}
        </span>
        <h3 className="text-[0.9375rem] font-semibold leading-snug text-ink">{title}</h3>
      </div>
      <p className="text-[0.84375rem] leading-relaxed text-ink-2">{text}</p>
      <ul className="flex flex-wrap gap-1.5">
        {facts.map((fact) => (
          <li key={fact} className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-2 ring-1 ring-line">
            {fact}
          </li>
        ))}
      </ul>
      {disabledNote === undefined ? <div className="grid gap-2">{children}</div> : <p className="text-xs font-semibold text-warn">{disabledNote}</p>}
    </article>
  );
}

/**
 * What a channel with no posts of its own is offered: the same topics as the channels already written (quicker, and it says the same things
 * on the same days), or new topics written just for it, on its own days. One card, two clear ways, instead of two separate cards.
 */
export function AddChannelChoice({ channel, writtenFor, canCopy, postingDays, website, startDate, busy, canChange }: AddChannelChoiceProps): ReactElement {
  const copy = useReviewAction();
  const [asking, setAsking] = useState(false);
  const [writing, setWriting] = useState(false);
  const name = PLATFORM_NAMES[channel];
  const source = names(writtenFor);
  return (
    <section aria-labelledby="add-channel-title" className={cn(LIFT, "grid gap-4 p-5")}>
      <div className="flex items-center gap-3">
        <ChannelLogo platform={channel} medium />
        <div className="min-w-0">
          <h2 id="add-channel-title" className={SECTION_TITLE}>
            Posts for {name}
          </h2>
          <p className="mt-0.5 text-[0.84375rem] text-ink-2">{name} has no posts yet. Where should its topics come from?</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Way
          icon={<Repeat size={18} weight="bold" />}
          title={`Same topics as ${source}`}
          text={`We write ${name}'s own words for the topics you already have, so it says the same things on the same days. You only look over the words and the pictures.`}
          facts={[`Same days as ${source}`, "Quicker"]}
          {...(canCopy ? {} : { disabledNote: `${name} posts on other days than ${source}, so its posts cannot share these topics.` })}
        >
          {!canChange ? null : asking ? (
            <>
              <p className="rounded-lg bg-warn-wash px-3 py-2 text-xs leading-relaxed text-ink">This writes new words for {name} and draws a picture for each topic you have kept. It uses pictures from your allowance. Nothing goes out until you approve.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={copy.pending || busy}
                  onClick={() => {
                    setAsking(false);
                    copy.run(addNetworkAction, { network: channel });
                  }}
                  className={SMALL_DARK}
                >
                  Yes, write and draw
                </button>
                <button type="button" onClick={() => setAsking(false)} className={SMALL_SOFT}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" disabled={copy.pending || busy} onClick={() => setAsking(true)} className={SMALL_SOFT}>
              {busy ? "Writing" : `Use the same topics for ${name}`}
            </button>
          )}
        </Way>
        <Way
          icon={<Lightbulb size={18} weight="bold" />}
          title={`New topics for ${name}`}
          text={`We read your website again and write fresh topics just for ${name}, on its own days. It takes a few minutes. You look the posts over before anything is drawn or posted.`}
          facts={[`${name} posts on ${daysWords(postingDays?.[channel])}`, "Its own topics"]}
          {...(website === null ? { disabledNote: "We need your website first." } : {})}
        >
          {!canChange ? null : (
            <button type="button" disabled={busy} onClick={() => setWriting(true)} className={SMALL_DARK}>
              Write new topics for {name}
            </button>
          )}
        </Way>
      </div>
      {copy.notice === null ? null : (
        <p role="status" className="text-[0.84375rem] font-semibold text-ink">
          {copy.notice}
        </p>
      )}
      {copy.error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {copy.error}
        </p>
      )}
      {writing && website !== null ? <StartDialog connected={new Set([channel])} postingDays={postingDays} startDate={startDate} website={website} onClose={() => setWriting(false)} /> : null}
    </section>
  );
}
