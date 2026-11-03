import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { connectChannelAction } from "@/app/app-host/(protected)/social/actions";
import { DARK_BUTTON, LIFT } from "@/components/v2/classes";
import type { ConnectStatus } from "@/lib/social/auto";

/**
 * Where the posts stand and what happens next, with a dark button only when there is something for the customer to do (connect, or renew). It sits under the channels from a laptop up, and at the top
 * of the page on a phone (where the channels come last), so each place draws it and the other is hidden.
 */
export function ConnectStatusCard({ status }: { readonly status: ConnectStatus }): ReactElement {
  const { action } = status;
  const titleId = "connect-status-title";
  return (
    <section aria-labelledby={titleId} className={cn(LIFT, "grid gap-4 p-5 lg:hidden")}>
      <div className="min-w-0">
        <h2 id={titleId} className="font-display text-[1.0625rem] font-semibold leading-snug text-ink">
          {status.title}
        </h2>
        <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">{status.text}</p>
      </div>
      {action === null ? null : action.kind === "connect" ? (
        <form action={connectChannelAction}>
          <input type="hidden" name="channel" value={action.platform} />
          <button type="submit" className={cn(DARK_BUTTON, "w-full sm:w-auto")}>
            {status.actionLabel}
          </button>
        </form>
      ) : (
        <a href="#channels" className={cn(DARK_BUTTON, "w-full sm:w-auto")}>
          {status.actionLabel}
        </a>
      )}
    </section>
  );
}
