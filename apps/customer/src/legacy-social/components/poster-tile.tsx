"use client";

import { useState, type ReactElement } from "react";
import { decidePosterAction } from "@/legacy-social/review-actions";
import { REJECT_REASON_WORDS, type Poster } from "@/legacy-social/lib/social/ai";
import { PLATFORM_NAMES } from "@/legacy-social/lib/social/auto";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

export const imageUrl = (id: string): string => `/api/social-posters/image?id=${encodeURIComponent(id)}`;

/** Where a picture stands, in the customer's words. */
export function pictureWord(poster: Pick<Poster, "status">): string {
  switch (poster.status) {
    case "approved":
      return "Approved";
    case "expired":
      return "Put away: nobody decided in time";
    case "rejected":
      return "Put away";
    case "blocked":
      return "Did not pass our checks";
    case "held":
      return "Needs you to confirm again";
    default:
      return "Waiting for you";
  }
}

/** A line for a picture that is the same drawing as another network's: it is shared on purpose, and Draw another gives this network its own. */
export function sharedNote(poster: Pick<Poster, "sharedWith" | "status" | "canRedraw">): string | null {
  const others = poster.sharedWith ?? [];
  if (others.length === 0 || (poster.status !== "pending" && poster.status !== "approved" && poster.status !== "held")) return null;
  const names = others.map((network) => PLATFORM_NAMES[network]);
  const list = names.length === 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
  return poster.canRedraw ? `Same picture as ${list}. Use Draw another for a different one.` : `Same picture as ${list}.`;
}

/** One picture: how it looks, where it goes, and what the customer can do with it. */
export function PosterTile({ poster, reasons, onNotice }: { readonly poster: Poster; readonly reasons: readonly string[]; readonly onNotice: (message: string) => void }): ReactElement {
  const { pending, error, run } = useReviewAction(onNotice);
  const [sendingBack, setSendingBack] = useState(false);
  const [changingWords, setChangingWords] = useState(false);
  const [words, setWords] = useState(poster.caption);
  const [reason, setReason] = useState(reasons[0] ?? "other");
  const approved = poster.status === "approved";
  const blocked = poster.status === "blocked";
  const held = poster.status === "held";
  const expired = poster.status === "expired";
  const putAway = poster.status === "rejected" || expired;
  // The words of a picture that is waiting or approved can change: that makes a new version of the same picture to approve again.
  const wordsCanChange = poster.status === "pending" || approved;
  return (
    <li className="grid content-start gap-3 rounded-xl bg-surface p-3 ring-1 ring-line">
      <div className="flex items-center gap-2 text-[0.84375rem] font-semibold text-ink">
        <ChannelLogo platform={poster.network} small />
        {PLATFORM_NAMES[poster.network]}
      </div>
      <div className="grid place-items-center overflow-hidden rounded-lg bg-surface" style={{ aspectRatio: `${poster.width} / ${poster.height}` }}>
        {/* The picture is served by social-auto through our own route, which Next's image optimiser cannot reach. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl(poster.id)} alt={`Picture for ${PLATFORM_NAMES[poster.network]}: ${poster.headline}`} className="size-full object-cover" />
      </div>
      <p className="text-xs font-semibold text-ink-2">{pictureWord(poster)}</p>
      {poster.notice === undefined ? null : <p className="text-xs text-ink-2">{poster.notice}</p>}
      {sharedNote(poster) === null ? null : <p className="text-xs text-ink-3">{sharedNote(poster)}</p>}
      {changingWords ? (
        <div className="grid gap-2">
          <label htmlFor={`words-${poster.id}`} className="text-xs font-semibold text-ink-2">
            Its words
          </label>
          <textarea id={`words-${poster.id}`} value={words} onChange={(event) => setWords(event.target.value)} maxLength={3000} className="min-h-28 w-full rounded-lg border border-ink-2/65 bg-surface p-3 text-[0.875rem] leading-relaxed text-ink" />
          <p className="text-xs text-ink-3">The picture stays the same, so the words printed on it cannot change here. You approve the new words before it goes out.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || words.trim() === ""}
              onClick={() => run(decidePosterAction, { action: "change-words", id: poster.id, caption: words }, () => setChangingWords(false))}
              className={SMALL_DARK}
            >
              Save the words
            </button>
            <button type="button" onClick={() => { setWords(poster.caption); setChangingWords(false); }} className={SMALL_SOFT}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {changingWords ? null : sendingBack ? (
        <div className="grid gap-2">
          <label htmlFor={`reason-${poster.id}`} className="text-xs font-semibold text-ink-2">
            What is wrong with it
          </label>
          <select id={`reason-${poster.id}`} value={reason} onChange={(event) => setReason(event.target.value)} className="h-11 rounded-lg border border-ink-2/65 bg-surface px-3 text-[0.875rem] text-ink">
            {(reasons.length === 0 ? ["other"] : reasons).map((one) => (
              <option key={one} value={one}>
                {REJECT_REASON_WORDS[one] ?? "Something else"}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(decidePosterAction, { action: "reject", id: poster.id, reason }, () => setSendingBack(false))}
              className={SMALL_SOFT}
            >
              Send it back
            </button>
            <button type="button" onClick={() => setSendingBack(false)} className={SMALL_SOFT}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {wordsCanChange ? (
            <button type="button" disabled={pending} onClick={() => setChangingWords(true)} className={SMALL_SOFT}>
              Change the words
            </button>
          ) : null}
          {approved ? (
            <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "withdraw", id: poster.id })} className={SMALL_SOFT}>
              Take back my approval
            </button>
          ) : (
            <>
              {blocked || putAway ? null : (
                <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "approve", id: poster.id })} className={SMALL_SOFT}>
                  {held ? "Confirm again" : "Approve"}
                </button>
              )}
              {poster.canRedraw ? (
                <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "redraw", id: poster.id })} className={SMALL_SOFT}>
                  Draw another
                </button>
              ) : null}
              {putAway ? null : blocked ? (
                // A picture that did not pass our checks is put away in one step: there is nothing to say about it that we have not already said.
                <button type="button" disabled={pending} onClick={() => run(decidePosterAction, { action: "reject", id: poster.id, reason: "other" })} className={SMALL_SOFT}>
                  Put it away
                </button>
              ) : (
                <button type="button" disabled={pending} onClick={() => setSendingBack(true)} className={SMALL_SOFT}>
                  Send it back
                </button>
              )}
            </>
          )}
        </div>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
    </li>
  );
}
