import type { ReactElement } from "react";
import { PageSection } from "@/components/v2/page";
import { SITE_CONTACT_WINDOW_DAYS, type SiteContacts } from "@/lib/site-contacts";

/** The people who rang, tapped WhatsApp or sent the contact form from the website lately: three figures in a row. */
export function SiteContactFigures({ contacts }: { readonly contacts: SiteContacts }): ReactElement {
  const figures = [
    { label: "Calls", value: contacts.call },
    { label: "WhatsApp", value: contacts.whatsapp },
    { label: "Forms", value: contacts.form },
  ];
  return (
    <PageSection id="contacts" title="Contacts from your website" aside={`Last ${SITE_CONTACT_WINDOW_DAYS} days`}>
      <dl className="grid grid-cols-3 divide-x divide-line">
        {figures.map((figure) => (
          <div key={figure.label} className="px-4 first:pl-0 sm:px-6">
            <dt className="text-[0.8125rem] text-ink-2">{figure.label}</dt>
            <dd className="mt-1 font-figure text-[1.75rem] font-semibold leading-none tracking-[-0.03em] tabular-nums text-ink">{figure.value}</dd>
          </div>
        ))}
      </dl>
    </PageSection>
  );
}
