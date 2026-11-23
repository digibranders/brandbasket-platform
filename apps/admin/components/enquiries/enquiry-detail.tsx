import type { Lead, LeadInvite, StoredConsent } from "@brandbasket/db";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LEAD_SOURCE_LABELS, websitePlanLabels } from "@brandbasket/shared/lib/lead-source";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { INVITE_STATE_LABELS, inviteStateOf, leadHistory } from "@/lib/enquiries";
import { attachAccountAction } from "@/app/(protected)/leads/[leadId]/actions";
import { LeadEditForm } from "./lead-edit-form";

interface EnquiryDetailProps {
  readonly lead: Lead;
  /** Newest first. */
  readonly invites: readonly LeadInvite[];
  /** The latest agreement to be contacted, or null when none is recorded. */
  readonly consent: StoredConsent | null;
  /** The lead's email has an account but no business: setup stopped halfway. */
  readonly strandedAccount: boolean;
  readonly currencyLocked: boolean;
  readonly now: Date;
}

/**
 * What the Enquiries side panel holds for the open enquiry: how to reach them, what they said, the facts, the repair for a
 * stranded account, the edit form and the history. The actions (Send setup link, Mark contacted, Mark lost) sit in the panel foot.
 */
export function EnquiryDetail({ lead, invites, consent, strandedAccount, currencyLocked, now }: EnquiryDetailProps): ReactElement {
  const phone = lead.phone === null ? null : displayPhone(lead.phone);
  const sourceLabel = LEAD_SOURCE_LABELS[lead.source];
  const latestInvite = invites[0] ?? null;

  return (
    <div className="grid gap-4">
      <p className="text-[0.8125rem] text-ink-2">
        Arrived <LocalDateTime iso={lead.createdAt.toISOString()} variant="timestamp" />
      </p>

      <div className="flex flex-wrap gap-2">
        {phone === null || phone.href === null ? null : (
          <a href={phone.href} className={buttonSmall}>
            {phone.text}
          </a>
        )}
        {lead.phone === null ? null : (
          <a href={`https://wa.me/${lead.phone.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer" className={buttonSmall}>
            WhatsApp
          </a>
        )}
        <a href={`mailto:${lead.email}`} className={buttonSmall}>
          Email
        </a>
      </div>

      {lead.message === null ? null : (
        <div>
          <p className="mb-1 text-xs font-semibold text-ink-2">Their message</p>
          <p className="whitespace-pre-wrap rounded-[0.625rem] bg-bg p-3 text-[0.84375rem] leading-relaxed text-ink">{lead.message}</p>
        </div>
      )}

      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-[0.84375rem]">
        <dt className="text-ink-2">Picked on the website</dt>
        <dd className="text-right font-semibold">{lead.plans.length === 0 ? "Nothing picked" : websitePlanLabels(lead.plans).join(", ")}</dd>
        <dt className="text-ink-2">Came from</dt>
        <dd className="text-right font-semibold">{lead.page === null ? sourceLabel : `${sourceLabel}, ${lead.page}`}</dd>
        <dt className="text-ink-2">Consent</dt>
        <dd className="text-right font-semibold">{consent === null ? "Not recorded" : `Given, notice ${consent.noticeVersion}`}</dd>
        <dt className="text-ink-2">Setup link</dt>
        <dd className="text-right font-semibold">
          {latestInvite === null ? (
            "Not sent yet"
          ) : (
            <>
              {INVITE_STATE_LABELS[inviteStateOf(latestInvite, now)]}, sent <LocalDateTime iso={latestInvite.createdAt.toISOString()} variant="timestamp" />
            </>
          )}
        </dd>
      </dl>

      {strandedAccount ? (
        <form action={attachAccountAction} className="grid gap-2 rounded-[0.625rem] bg-rattan-wash p-3">
          <input type="hidden" name="leadId" value={lead.id} />
          <p className="text-[0.8125rem] text-ink">
            {lead.email} already has an account but no website, which happens when setup stopped halfway. This creates {lead.businessName} and makes them
            its owner, without sending another link. Any setup link still open for this lead stops working.
          </p>
          <button type="submit" className={cn(buttonSecondary, "justify-self-start")}>
            Attach account
          </button>
        </form>
      ) : null}

      <details>
        <summary className="cursor-pointer text-[0.8125rem] font-semibold text-ink">Edit status, billing currency and notes</summary>
        <div className="mt-3">
          <LeadEditForm lead={lead} currencyLocked={currencyLocked} />
        </div>
      </details>

      <div>
        <p className="mb-1 text-xs font-semibold text-ink-2">History</p>
        <ul className="grid gap-1.5">
          {leadHistory(lead, invites, sourceLabel).map((line) => (
            <li key={`${line.at.toISOString()}-${line.text}`} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-[0.8125rem]">
              <span className="font-figure text-xs text-ink-2">
                <LocalDateTime iso={line.at.toISOString()} variant="timestamp" />
              </span>
              <span>{line.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
