import type { ReactElement } from "react";
import type { ListingEnquiry } from "@fynix/db";
import { LocalDateTime } from "@fynix/shared/ui/panel/local-date-time";
import { displayPhone } from "@fynix/shared/server/phone-display";

interface EnquiriesListProps {
  /** Newest first. */
  readonly enquiries: readonly ListingEnquiry[];
  /** How many were asked for: a full list may have older ones that are not shown. */
  readonly limit: number;
}

/**
 * What visitors sent this business from its page on the local directory: who, their number to call back, and what they
 * asked. The same enquiries are emailed to the owner as they arrive.
 */
export function EnquiriesList({ enquiries, limit }: EnquiriesListProps): ReactElement {
  if (enquiries.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        None yet. When someone taps Enquire on your page, their name, number and message show here, and we email them to you.
      </p>
    );
  }
  return (
    <>
      <ul className="divide-y divide-line">
        {enquiries.map((enquiry) => {
          // A sender who has erased their data has no number to show or call.
          const phone = enquiry.phone === null ? { text: "Number erased", href: null } : displayPhone(enquiry.phone);
          return (
            <li key={enquiry.id} className="grid gap-1 py-4 first:pt-0">
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="font-semibold">{enquiry.name}</span>
                <span className="tabular-nums text-ink-soft">
                  <LocalDateTime iso={enquiry.createdAt.toISOString()} variant="timestamp" />
                </span>
              </p>
              <p className="text-sm">
                {phone.href === null ? (
                  <span className="tabular-nums">{phone.text}</span>
                ) : (
                  <a href={phone.href} className="link-underline tabular-nums">
                    {phone.text}
                  </a>
                )}
              </p>
              {enquiry.message === null ? null : <p className="max-w-prose whitespace-pre-line text-sm text-ink-soft">{enquiry.message}</p>}
            </li>
          );
        })}
      </ul>
      {enquiries.length >= limit ? <p className="mt-4 text-sm text-ink-soft">Showing your latest {limit}.</p> : null}
    </>
  );
}
