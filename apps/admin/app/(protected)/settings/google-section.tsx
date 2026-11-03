import type { ReactElement } from "react";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { hintClasses } from "@/components/console/field-styles";
import { Section } from "@/components/console/section";
import type { GoogleConnectionState } from "@/lib/server/google-admin";

const ROWS = {
  read: { title: "Reading", what: "Used every night to pull Search Console and Analytics numbers. It can read, never change." },
  write: { title: "Setting up sites", what: "Used only when a site goes live: to create its Analytics property, prove the domain and add it to Search Console." },
} as const;

function statusLine(state: GoogleConnectionState): string {
  const { connection } = state;
  if (connection === null) return "Not connected";
  return connection.status === "access_lost" ? "Google no longer accepts this sign-in. Connect again." : `Connected as ${connection.accountEmail}`;
}

/** The Brandbasket Google account's two sign-ins. Only status is shown, never a token. */
export function GoogleAccountSection({ states, accountEmail }: { readonly states: readonly GoogleConnectionState[]; readonly accountEmail: string | null }): ReactElement {
  return (
    <Section id="google" title="Google account" aside="Admins only">
      <div className="grid max-w-2xl gap-8">
        <p className="text-sm text-ink-soft">
          One Brandbasket Google account holds every client&apos;s Search Console site and Analytics property.{" "}
          {accountEmail === null ? "The sign-in is not set up on this server yet." : <>Sign in as <b className="font-medium text-ink">{accountEmail}</b>; any other account is refused.</>} Each sign-in is
          kept encrypted and is never shown.
        </p>
        {states.map((state) => (
          <form key={state.purpose} method="post" action="/api/google/connect" className="grid gap-3 border-t border-line pt-6 first:border-t-0 first:pt-0">
            <input type="hidden" name="purpose" value={state.purpose} />
            <div>
              <p className="text-sm font-medium text-ink">{ROWS[state.purpose].title}</p>
              <p className={hintClasses}>{ROWS[state.purpose].what}</p>
            </div>
            <p className="text-sm text-ink-2">
              {statusLine(state)}
              {state.connection?.lastOkAt == null ? null : (
                <>
                  {" "}
                  · Last used <LocalDateTime iso={state.connection.lastOkAt.toISOString()} variant="timestamp" />
                </>
              )}
            </p>
            {state.connection?.lastError == null ? null : <p className="text-sm text-ink-soft">{state.connection.lastError}</p>}
            <div>
              <button type="submit" disabled={accountEmail === null} className={state.connection === null || state.connection.status === "access_lost" ? buttonPrimary : buttonSecondary}>
                {state.connection === null ? "Connect" : "Connect again"}
              </button>
            </div>
          </form>
        ))}
      </div>
    </Section>
  );
}
