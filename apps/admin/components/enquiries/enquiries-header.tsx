import Link from "next/link";
import type { ReactElement } from "react";
import { buttonSecondary } from "@/components/console/buttons";
import { PageHeader } from "@/components/console/page-header";
import { enquiryHref, type EnquiryQuery } from "@/lib/enquiries";

interface EnquiriesHeaderProps {
  readonly query: EnquiryQuery;
  readonly weekCount: number;
  readonly toContactCount: number;
}

/** Title, the week's count, and the two secondary actions. The open enquiry carries the screen's one dark button. */
export function EnquiriesHeader({ query, weekCount, toContactCount }: EnquiriesHeaderProps): ReactElement {
  return (
    <PageHeader
      title="Enquiries"
      meta={`${weekCount} this week · ${toContactCount} not contacted yet`}
      action={
        <div className="flex gap-2">
          <a href={enquiryHref(query, {}, "/leads/export")} className={buttonSecondary}>
            Export
          </a>
          <Link href="/leads/new" className={buttonSecondary}>
            Add enquiry
          </Link>
        </div>
      }
    />
  );
}
