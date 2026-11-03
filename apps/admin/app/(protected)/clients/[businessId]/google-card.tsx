import type { ReactElement } from "react";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { buttonDanger, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses } from "@/components/console/field-styles";
import { Fold } from "@/components/console/fold";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import {
  analyticsFacts,
  analyticsPill,
  GOOGLE_CARD_TITLES,
  googleButtons,
  googleCallout,
  googleCardState,
  searchConsoleFacts,
  searchConsolePill,
  type GoogleFact,
  type GooglePill,
  type GoogleSourceRow,
} from "@/lib/google-card";
import { GOOGLE_NOTICES, type GoogleNotice } from "@/lib/google-card-notices";
import { AnalyticsBlock } from "./parts";
import { detachGoogleAction, provisionGoogleAction, retryGoogleVerificationAction } from "./google-actions";

export interface GoogleCardProps {
  readonly businessId: string;
  readonly gsc: GoogleSourceRow | null;
  readonly ga4: GoogleSourceRow | null;
  /** The newest day with a number for each source (YYYY-MM-DD), or null. */
  readonly gscLatestDay: string | null;
  readonly ga4LatestDay: string | null;
  /** The client's primary address, when they have one. */
  readonly hostname: string | null;
  /** That address is one of ours (a free address), which is never indexed. */
  readonly freeAddress: boolean;
  /** The platform's switch for the Analytics tag. */
  readonly tagEnabled: boolean;
  /** The staff member's role may detach and provision; otherwise the card is read only. */
  readonly canManage: boolean;
  readonly notice: GoogleNotice | null;
  /** For the existing Property ID form: the account a customer adds as Viewer. */
  readonly serviceAccountEmail: string | null;
  readonly now: Date;
}

function FactRows({ facts }: { readonly facts: readonly GoogleFact[] }): ReactElement {
  return (
    <dl className="divide-y divide-line">
      {facts.map((fact) => (
        <div key={fact.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="text-xs text-ink-2">{fact.label}</dt>
          <dd className="min-w-0 text-right text-sm">
            <span className={fact.figure === true ? "break-all font-figure tabular-nums" : fact.label === "Last data day" && fact.value !== "None yet" ? "font-figure tabular-nums" : undefined}>
              {fact.label === "Last data day" && fact.value !== "None yet" ? formatStoredDate(fact.value) : fact.value}
            </span>
            {fact.at === undefined ? null : (
              <>
                {", "}
                <LocalDateTime iso={fact.at.toISOString()} variant="timestamp" />
              </>
            )}
            {fact.note === undefined ? null : <span className="block break-words text-xs text-ink-2">{fact.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Half({ title, pill, facts }: { readonly title: string; readonly pill: GooglePill; readonly facts: readonly GoogleFact[] }): ReactElement {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 border-b border-line pb-2 font-display text-sm font-semibold text-ink">
        {title}
        <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
      </h3>
      <FactRows facts={facts} />
    </div>
  );
}

/**
 * Both Google halves of a client's site in one place (plan 62, step 5): Search Console and Analytics, the state in words and only
 * the buttons that make sense for it. It shows what the two rows say and nothing more, so it never claims the tag was seen on
 * the live page. Support staff see it read only.
 */
export function GoogleCard({ businessId, gsc, ga4, gscLatestDay, ga4LatestDay, hostname, freeAddress, tagEnabled, canManage, notice, serviceAccountEmail, now }: GoogleCardProps): ReactElement {
  const state = googleCardState({ gsc, ga4, freeAddress, now });
  const callout = googleCallout({ state, gsc, ga4, hostname, now });
  const buttons = googleButtons({ state, gsc, ga4, canManage });
  const idField = <input type="hidden" name="businessId" value={businessId} />;
  const hasButtons = buttons.openSearchConsole !== null || buttons.openAnalytics !== null || buttons.openLiveSite !== null || buttons.retry || buttons.detach || buttons.provisionNow;
  return (
    <Section title="Google" id="google" aside={GOOGLE_CARD_TITLES[state]}>
      <div className="grid gap-5">
        {notice === null ? null : <Notice tone={GOOGLE_NOTICES[notice].ok ? "ok" : "problem"}>{GOOGLE_NOTICES[notice].text}</Notice>}
        {callout === null ? null : callout.tone === "bad" ? (
          <Notice tone="problem">
            <span>
              {callout.text}
              {callout.detail === undefined ? null : (
                <>
                  {" Last note: "}
                  <span className="font-figure">{callout.detail}</span>
                </>
              )}
            </span>
          </Notice>
        ) : (
          <p className="border-l-2 border-rattan py-1 pl-4 text-sm leading-relaxed text-ink">{callout.text}</p>
        )}

        {state === "free-address" || state === "not-added" ? (
          <dl className="max-w-md divide-y divide-line">
            {["Search Console", "Analytics"].map((name) => (
              <div key={name} className="flex justify-between gap-4 py-2.5">
                <dt className="text-sm">{name}</dt>
                <dd className="text-sm text-ink-2">Not added</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
            <Half title="Search Console" pill={searchConsolePill(gsc, now)} facts={searchConsoleFacts(gsc, gscLatestDay, now)} />
            <Half title="Analytics" pill={analyticsPill(ga4)} facts={analyticsFacts(ga4, ga4LatestDay, tagEnabled)} />
          </div>
        )}

        {hasButtons ? (
          <div className="flex flex-wrap items-center gap-2">
            {buttons.retry ? (
              <form action={retryGoogleVerificationAction}>
                {idField}
                <GatedSubmitButton className={buttonSecondary} pendingLabel="Asking…">
                  Retry verification
                </GatedSubmitButton>
              </form>
            ) : null}
            {buttons.provisionNow ? (
              <form action={provisionGoogleAction}>
                {idField}
                <GatedSubmitButton className={buttonSecondary} pendingLabel="Putting back…">
                  Provision now
                </GatedSubmitButton>
              </form>
            ) : null}
            {buttons.openLiveSite === null ? null : (
              <a href={buttons.openLiveSite} target="_blank" rel="noopener noreferrer" className={buttonSecondary}>
                Open the live site
              </a>
            )}
            {buttons.openSearchConsole === null ? null : (
              <a href={buttons.openSearchConsole} target="_blank" rel="noopener noreferrer" className={buttonSecondary}>
                Open in Search Console
              </a>
            )}
            {buttons.openAnalytics === null ? null : (
              <a href={buttons.openAnalytics} target="_blank" rel="noopener noreferrer" className={buttonSecondary}>
                Open in Analytics
              </a>
            )}
            {buttons.detach ? (
              <details className="ml-auto max-w-sm">
                <summary className="cursor-pointer text-sm font-semibold text-error">Detach</summary>
                <form action={detachGoogleAction} className="mt-3 grid gap-3">
                  {idField}
                  <label className="flex items-start gap-2 text-sm text-ink">
                    <input type="checkbox" name="confirm" value="yes" required className={checkboxClasses} />
                    <span>I want to detach this client from Google. The go-live job stops working on this site and their history is kept.</span>
                  </label>
                  <GatedSubmitButton className={`${buttonDanger} justify-self-start`} pendingLabel="Detaching…">
                    Detach
                  </GatedSubmitButton>
                </form>
              </details>
            ) : null}
          </div>
        ) : null}

        {canManage ? (
          <Fold title="Use a property the customer already has">
            <AnalyticsBlock businessId={businessId} source={ga4} serviceAccountEmail={serviceAccountEmail} />
          </Fold>
        ) : null}
      </div>
    </Section>
  );
}
