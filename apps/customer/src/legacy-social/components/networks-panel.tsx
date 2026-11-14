"use client";

import { useState, type ReactElement } from "react";
import { addNetworkAction } from "@/legacy-social/review-actions";
import { LIFT, SECTION_TITLE } from "@/legacy-social/classes";
import { PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { ChannelLogo } from "./channel-logo";
import { SMALL_WHITE } from "./small-buttons";
import { useReviewAction } from "./use-review-action";

interface NetworksPanelProps {
  /** The connected networks some post idea has no version for yet. */
  readonly missing: readonly ChannelPlatform[];
  /** True while posts for a new network are being written, so no second request is made. */
  readonly busy: boolean;
}

/**
 * Networks the customer connected after her posts were written. Those posts stay as they are, for the networks they were written for.
 * Only when she asks for it, here, we write the same topics she has kept for the new network and draw a picture for each. It is folded
 * away until she opens it, and asks once more before anything is written.
 */
export function NetworksPanel({ missing, busy }: NetworksPanelProps): ReactElement | null {
  const { pending, error, notice, run } = useReviewAction();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<ChannelPlatform | null>(null);
  if (missing.length === 0) return null;
  const names = missing.map((network) => PLATFORM_NAMES[network]).join(", ");
  return (
    <section aria-labelledby="networks-title" className={`${LIFT} grid gap-3 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="networks-title" className={SECTION_TITLE}>
            Posts already written
          </h2>
          <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">They stay as they are. {names} is used for the weeks we write next.</p>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={SMALL_WHITE}>
          {open ? "Close" : "Add a channel to these posts"}
        </button>
      </div>
      {open ? (
        <ul className="flex flex-wrap gap-3">
          {missing.map((network) => (
            <li key={network} className="flex items-center gap-3 rounded-xl bg-sunken px-3 py-2">
              <ChannelLogo platform={network} small />
              <span className="text-[0.875rem] font-semibold text-ink">{PLATFORM_NAMES[network]}</span>
              <button type="button" disabled={pending || busy} onClick={() => setAsking(network)} className={SMALL_WHITE}>
                {busy ? "Writing" : `Add ${PLATFORM_NAMES[network]} to my posts`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {asking === null ? null : (
        <div role="alertdialog" aria-label={`Add ${PLATFORM_NAMES[asking]} to your posts`} className="grid gap-3 rounded-xl bg-warn-wash px-4 py-3">
          <p className="text-[0.84375rem] leading-relaxed text-ink">
            This writes new words for {PLATFORM_NAMES[asking]} and draws a picture for each topic you have kept. It uses pictures from your allowance. Nothing goes out until you approve.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || busy}
              onClick={() => {
                const network = asking;
                setAsking(null);
                run(addNetworkAction, { network });
              }}
              className={SMALL_WHITE}
            >
              Yes, write and draw
            </button>
            <button type="button" onClick={() => setAsking(null)} className={SMALL_WHITE}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {notice === null ? null : (
        <p role="status" className="text-[0.84375rem] font-semibold text-ink">
          {notice}
        </p>
      )}
      {error === null ? null : (
        <p role="alert" className="text-[0.84375rem] font-semibold text-error">
          {error}
        </p>
      )}
    </section>
  );
}
