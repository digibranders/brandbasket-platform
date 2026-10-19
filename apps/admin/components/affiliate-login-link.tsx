"use client";

import { useActionState, useRef, useState, type ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { StatusDot } from "@/components/console/status-dot";

export type LoginLinkState =
  | { readonly status: "idle" }
  | { readonly status: "link"; readonly url: string; readonly expiresAt: string }
  | { readonly status: "error"; readonly message: string };

const initialLoginLinkState: LoginLinkState = { status: "idle" };

interface AffiliateLoginLinkProps {
  readonly action: (state: LoginLinkState, formData: FormData) => Promise<LoginLinkState>;
  /** They have chosen a password: they can sign in. */
  readonly signedUp: boolean;
  /** When the link staff last sent stops working, as an ISO time; null when none is open. */
  readonly linkExpiresAt: string | null;
}

/**
 * The affiliate's sign-in, from staff's side: whether they have one, and a button that makes the link they open to
 * choose a password. The link is shown once, right after it is made, to copy into WhatsApp or an email.
 */
export function AffiliateLoginLink({ action, signedUp, linkExpiresAt }: AffiliateLoginLinkProps): ReactElement {
  const [state, formAction, isPending] = useActionState(action, initialLoginLinkState);
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const linkRef = useRef<HTMLInputElement>(null);

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      // Refused (an insecure page, a locked-down browser): select it so it can be copied by hand.
      linkRef.current?.select();
      setCopied("failed");
    }
  }

  const standing = signedUp ? (
    <StatusDot tone="done" label="Can sign in" />
  ) : linkExpiresAt !== null ? (
    <StatusDot tone="waiting" label="Link sent, not used yet" />
  ) : (
    <StatusDot tone="quiet" label="No sign-in yet" />
  );

  return (
    <div className="max-w-xl space-y-5">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {standing}
        {!signedUp && linkExpiresAt !== null ? (
          <span className="text-sm text-ink-soft">
            Open until <LocalDate iso={linkExpiresAt} />
          </span>
        ) : null}
      </p>

      <form action={formAction}>
        <button type="submit" disabled={isPending} className={cn(signedUp || linkExpiresAt !== null ? buttonSecondary : buttonPrimary)}>
          {isPending ? "Making the link…" : signedUp ? "Send a password link" : linkExpiresAt !== null ? "Make a new link" : "Create sign-in link"}
        </button>
      </form>

      {state.status === "error" && !isPending ? (
        <p role="alert" className="border-l-2 border-accent py-1 pl-4 text-sm text-accent">
          {state.message}
        </p>
      ) : null}

      {state.status === "link" && !isPending ? (
        <div className="space-y-3">
          <label htmlFor="affiliate-login-link" className="block text-sm font-medium text-ink-soft">
            Send them this link
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              id="affiliate-login-link"
              ref={linkRef}
              readOnly
              value={state.url}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-control border border-ink-soft/65 bg-white px-4 py-2.5 text-sm text-ink"
            />
            <button type="button" onClick={() => void copy(state.url)} className={buttonSecondary}>
              {copied === "copied" ? "Copied" : "Copy link"}
            </button>
          </div>
          <p role="status" className="text-sm text-ink-soft">
            {copied === "failed" ? "Couldn’t copy. The link is selected: copy it by hand. " : null}
            It works once and expires in 7 days. You won’t see it again, so copy it now.
          </p>
        </div>
      ) : null}
    </div>
  );
}
