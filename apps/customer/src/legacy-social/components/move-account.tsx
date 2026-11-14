import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { CHANNEL_NAMES } from "@/features/social/analytics/rules";
import type { Platform } from "@/features/social/analytics/rules";
import { moveChannelAction } from "@/legacy-social/actions";
import { LIFT } from "@/legacy-social/classes";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_WHITE } from "./small-buttons";

/** An account the customer tried to connect that another of her brands already holds. */
export interface MoveOffer {
  readonly channel: Platform;
  /** The posting service's id of the brand that holds it. */
  readonly heldBy: string;
  readonly brandName: string;
}

/**
 * Asks before an account is taken from another brand: the account is connected to {brand}, so it was not connected here. "Move it" connects it here and
 * leaves {brand} without it (its posts for that channel are held, nothing is deleted); Cancel changes nothing.
 */
export function MoveAccountPrompt({ offer }: { readonly offer: MoveOffer }): ReactElement {
  const name = CHANNEL_NAMES[offer.channel];
  return (
    <section role="alert" aria-labelledby="move-account-title" className={cn(LIFT, "flex flex-wrap items-center gap-x-5 gap-y-3 p-4")}>
      <ChannelLogo platform={offer.channel} medium />
      <div className="min-w-0 flex-1 basis-72">
        <h2 id="move-account-title" className="type-section text-ink">
          This {name} account is connected to {offer.brandName}
        </h2>
        <p className="mt-0.5 text-[0.84375rem] leading-relaxed text-ink-2">Move it here? Posts scheduled for {name} on {offer.brandName} will stop going out. Nothing is deleted, and you can connect an account to {offer.brandName} again later.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={moveChannelAction}>
          <input type="hidden" name="channel" value={offer.channel} />
          <input type="hidden" name="moveFrom" value={offer.heldBy} />
          <button type="submit" className={SMALL_DARK}>
            Move it here
          </button>
        </form>
        <Link href="/social" className={cn(SMALL_WHITE, "no-underline")}>
          Cancel
        </Link>
      </div>
    </section>
  );
}
