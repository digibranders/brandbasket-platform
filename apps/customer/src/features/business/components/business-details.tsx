import { Panel, PanelError } from "@/components";
import type { CustomerContext } from "@/lib/guards";
import type { Loaded } from "@/lib/loaded";
import type { ContactView, SiteFactsView } from "../loader";
import { AnnouncementSection } from "./announcement-section";
import { ContactSection } from "./contact-section";
import { HoursSection } from "./hours-section";
import { HolidaysSection } from "./holidays-section";
import { SaveBarHost } from "./save-bar-host";

export interface BusinessDetailsProps {
  readonly customer: CustomerContext;
  readonly contact: Loaded<ContactView>;
  /** Null for a business without the Managed Website: hours, holidays and the announcement feed only the website. */
  readonly siteFacts: Loaded<SiteFactsView> | null;
}

/**
 * The Details tab: contact details for every paying customer, and for the Managed Website also hours, holidays and the
 * announcement banner (what `/api/site/info` serves). Each group is its own panel with its own loader, so one failing read
 * never hides the other. Viewers see everything read-only.
 */
export function BusinessDetails({ customer, contact, siteFacts }: BusinessDetailsProps) {
  const readOnly = customer.role === "viewer";
  return (
    <SaveBarHost>
      <div className="flex flex-col gap-4 pb-save-bar">
        {contact.ok ? (
          <Panel flush className="overflow-hidden">
            <div className="-mb-px">
              <ContactSection
                contact={contact.data}
                readOnly={readOnly}
                savedMessage={customer.billing.hasWebsite ? "Saved. Your website updates in about a minute." : "Saved."}
                postalLabel={customer.currency === "INR" ? "PIN code" : "Postal code"}
              />
            </div>
          </Panel>
        ) : (
          <Panel title="Your details">
            <PanelError failure={contact.error} what="your business details" />
          </Panel>
        )}
        {siteFacts === null ? null : siteFacts.ok ? (
          <Panel flush className="overflow-hidden">
            <div className="-mb-px">
              <HoursSection hours={siteFacts.data.hours} readOnly={readOnly} />
              <HolidaysSection closures={siteFacts.data.closures} today={siteFacts.data.today} readOnly={readOnly} />
              <AnnouncementSection
                announcement={siteFacts.data.announcement}
                today={siteFacts.data.today}
                defaultStartsOn={siteFacts.data.defaultStartsOn}
                defaultEndsOn={siteFacts.data.defaultEndsOn}
                readOnly={readOnly}
              />
            </div>
          </Panel>
        ) : (
          <Panel title="Your website">
            <PanelError failure={siteFacts.error} what="your opening hours, holidays and announcement" />
          </Panel>
        )}
      </div>
    </SaveBarHost>
  );
}
