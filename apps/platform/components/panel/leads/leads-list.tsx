import type { ReactElement } from "react";
import type { ListingLead } from "@fynix/db";
import { cn } from "@fynix/shared/lib/cn";
import { displayPhone } from "@fynix/shared/server/phone-display";
import { PhoneIcon, TickIcon, WhatsAppIcon } from "@fynix/shared/ui/icons";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import { setLeadRepliedAction } from "@/app/app-host/(protected)/leads/actions";
import { leadSerialNumber, leadWhatsAppUrl } from "@/lib/leads";

/** A way to answer an enquiry, as a curved rectangle with its name beside the icon. At least 40px tall to be tapped. */
const ACTION =
  "inline-flex min-h-10 items-center gap-2 rounded-[0.625rem] border border-line px-3.5 text-sm font-medium text-ink transition-colors duration-300 ease-calm hover:border-ink hover:bg-paper-deep";

interface LeadsListProps {
  /** One page of enquiries, newest first. */
  readonly leads: readonly ListingLead[];
  /** Name the category each enquiry came through; on once the business has leads from more than one. */
  readonly showCategory?: boolean;
  /** How many newer enquiries the pages before this one hold, so the serial numbers run on from them. */
  readonly offset: number;
}

/**
 * One page of enquiries, split by hairlines: its number in the whole list, who asked (with a small "New" until the
 * owner marks it replied), what they asked on the line below, and when it came, right-aligned. Under each are the ways
 * to answer it: call the number they left, open a WhatsApp chat on it, and mark it replied (or new again). These are
 * about replying only. The list is an ordered one that starts at the page's first number, so screen readers announce
 * the same numbers that are shown.
 */
export function LeadsList({ leads, offset, showCategory = false }: LeadsListProps): ReactElement {
  return (
    <ol start={leadSerialNumber(offset, 0)} className="divide-y divide-line border-b border-line">
      {leads.map((lead, index) => {
        // A sender who has erased their data has no number: nothing to call or message.
        const phone = lead.phone === null ? null : displayPhone(lead.phone);
        const whatsapp = lead.phone === null ? null : leadWhatsAppUrl(lead.phone);
        const replied = lead.ownerRepliedAt !== null;
        return (
          <li key={lead.id} className="flex items-start gap-4 py-5">
            <span aria-hidden="true" className="w-8 shrink-0 pt-0.5 text-sm tabular-nums text-ink-soft">
              {leadSerialNumber(offset, index)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-semibold">{lead.name}</span>
                  {replied ? null : (
                    <span className="rounded-[0.375rem] bg-accent-pale px-2 py-0.5 text-[0.6875rem] font-semibold text-accent-deep">New</span>
                  )}
                </p>
                <span className="text-[0.8125rem] tabular-nums text-ink-soft">
                  <LocalDateTime iso={lead.createdAt.toISOString()} variant="timestamp" />
                </span>
              </div>
              {lead.message === null ? null : (
                <p className="mt-1 max-w-prose whitespace-pre-line text-sm text-ink-soft">{lead.message}</p>
              )}
              {showCategory ? <p className="mt-1 text-[0.8125rem] text-ink-soft">{lead.serviceLabel}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {phone === null || phone.href === null ? null : (
                  <a href={phone.href} className={ACTION}>
                    <PhoneIcon className="size-4" />
                    Call<span className="sr-only"> {lead.name} on {phone.text}</span>
                  </a>
                )}
                {whatsapp === null ? null : (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(ACTION, "hover:border-whatsapp")}>
                    <WhatsAppIcon className="size-4 text-whatsapp" />
                    WhatsApp<span className="sr-only"> {lead.name} (opens in a new tab)</span>
                  </a>
                )}
                <form action={setLeadRepliedAction}>
                  <input type="hidden" name="leadId" value={lead.id} />
                  <input type="hidden" name="replied" value={replied ? "false" : "true"} />
                  <button type="submit" className={cn(ACTION, "cursor-pointer", replied ? "text-ink-soft" : "")}>
                    {replied ? null : <TickIcon className="size-4" />}
                    {replied ? "Mark as new" : "Mark replied"}
                    <span className="sr-only"> for {lead.name}</span>
                  </button>
                </form>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
