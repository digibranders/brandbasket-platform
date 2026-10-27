import type { Lead, LeadInvite, StoredConsent } from "@brandbasket/db";
import Link from "next/link";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import { LEAD_SOURCE_LABELS, websitePlanLabels } from "@brandbasket/shared/lib/lead-source";
import { canStaffChangeLeadStatus } from "@brandbasket/shared/lib/lead-status";
import { SelectField } from "@brandbasket/shared/ui/select-field";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { buttonPrimary, buttonSecondary, buttonSmall } from "@/components/console/buttons";
import { LIFT } from "@/components/console/classes";
import { fieldClasses } from "@/components/console/field-styles";
import { StatusPill, type PillTone } from "@/components/console/status-pill";
import { bucketOf, ENQUIRY_BUCKET_LABELS, INVITE_STATE_LABELS, inviteStateOf, leadHistory } from "@/lib/enquiries";
import { assignLeadAction, attachAccountAction, sendSetupLinkAction, setEnquiryStatusAction } from "@/app/(protected)/leads/[leadId]/actions";
import { LeadEditForm } from "./lead-edit-form";

const PILL_TONE: Readonly<Record<ReturnType<typeof bucketOf>, PillTone>> = {
  to_contact: "wait",
  talking: "progress",
  link_sent: "progress",
  won: "done",
  lost: "todo",
};

interface EnquiryDetailProps {
  readonly lead: Lead;
  /** Newest first. */
  readonly invites: readonly LeadInvite[];
  /** The latest agreement to be contacted, or null when none is recorded. */
  readonly consent: StoredConsent | null;
  readonly staff: readonly { readonly userId: string; readonly name: string }[];
  /** The lead's email has an account but no business: setup stopped halfway. */
  readonly strandedAccount: boolean;
  readonly currencyLocked: boolean;
  readonly now: Date;
}

/** The open enquiry (mock screen 2, right): the screen's one raised surface and its one dark button. */
export function EnquiryDetail({ lead, invites, consent, staff, strandedAccount, currencyLocked, now }: EnquiryDetailProps): ReactElement {
  const phone = lead.phone === null ? null : displayPhone(lead.phone);
  const bucket = bucketOf(lead.status);
  const sourceLabel = LEAD_SOURCE_LABELS[lead.source];
  const latestInvite = invites[0] ?? null;
  const owner = lead.assignedStaffId === null ? "Nobody" : (staff.find((member) => member.userId === lead.assignedStaffId)?.name ?? "Someone who has left");

  return (
    <aside aria-labelledby="enquiry-title" className={cn(LIFT, "grid gap-4 p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="enquiry-title" className="font-display text-[1.1875rem] font-semibold tracking-[-0.02em] text-ink">
            {lead.businessName}
          </h2>
          <p className="mt-1 text-[0.8125rem] text-ink-2">
            {lead.name}
            {lead.city === null ? "" : ` · ${lead.city}`} · arrived <LocalDateTime iso={lead.createdAt.toISOString()} variant="timestamp" />
          </p>
        </div>
        <StatusPill tone={PILL_TONE[bucket]}>{ENQUIRY_BUCKET_LABELS[bucket]}</StatusPill>
      </div>

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
        <dt className="text-ink-2">Owner</dt>
        <dd className="text-right font-semibold">{owner}</dd>
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

      {lead.businessId === null ? (
        <form action={sendSetupLinkAction}>
          <input type="hidden" name="leadId" value={lead.id} />
          <button type="submit" className={cn(buttonPrimary, "w-full")}>
            Send the setup link
          </button>
        </form>
      ) : (
        <Link href={`/clients/${lead.businessId}`} className={cn(buttonPrimary, "w-full")}>
          View client
        </Link>
      )}

      {canStaffChangeLeadStatus(lead.status) ? (
        <div className="flex flex-wrap gap-2">
          <form action={setEnquiryStatusAction}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="status" value="call_done" />
            <button type="submit" className={buttonSmall}>
              Mark talking
            </button>
          </form>
          <form action={setEnquiryStatusAction}>
            <input type="hidden" name="leadId" value={lead.id} />
            <input type="hidden" name="status" value="lost" />
            <button type="submit" className={buttonSmall}>
              Mark lost
            </button>
          </form>
        </div>
      ) : null}

      <form action={assignLeadAction} className="flex items-end gap-2">
        <input type="hidden" name="leadId" value={lead.id} />
        <div className="min-w-0 flex-1">
          <label htmlFor="enquiry-owner" className="mb-1 block text-xs font-semibold text-ink-2">
            Owner
          </label>
          <SelectField
            id="enquiry-owner"
            name="assignee"
            options={[{ value: "", label: "Nobody" }, ...staff.map((member) => ({ value: member.userId, label: member.name }))]}
            defaultValue={lead.assignedStaffId ?? ""}
            className={fieldClasses}
          />
        </div>
        <button type="submit" className={buttonSmall}>
          Assign
        </button>
      </form>

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
    </aside>
  );
}
