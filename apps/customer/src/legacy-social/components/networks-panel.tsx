"use client";

import type { ReactElement } from "react";
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
 * Networks the customer connected after her posts were written. One press writes the same posts for that network, with no new website
 * read, and she approves only what is new. Shown only when there is something to offer.
 */
export function NetworksPanel({ missing, busy }: NetworksPanelProps): ReactElement | null {
  const { pending, error, notice, run } = useReviewAction();
  if (missing.length === 0) return null;
  return (
    <section aria-labelledby="networks-title" className={`${LIFT} grid gap-4 p-5`}>
      <div className="min-w-0">
        <h2 id="networks-title" className={SECTION_TITLE}>
          More networks
        </h2>
        <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">You connected these after your posts were written. We write the same posts for them in words that suit the network. Nothing goes out until you approve it.</p>
      </div>
      <ul className="flex flex-wrap gap-3">
        {missing.map((network) => (
          <li key={network} className="flex items-center gap-3 rounded-xl bg-sunken px-3 py-2">
            <ChannelLogo platform={network} small />
            <span className="text-[0.875rem] font-semibold text-ink">{PLATFORM_NAMES[network]}</span>
            <button type="button" disabled={pending || busy} onClick={() => run(addNetworkAction, { network })} className={SMALL_WHITE}>
              {busy ? "Writing" : `Write for ${PLATFORM_NAMES[network]}`}
            </button>
          </li>
        ))}
      </ul>
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
