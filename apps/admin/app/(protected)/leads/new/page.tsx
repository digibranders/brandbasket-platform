import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { phoneCountryOptions } from "@brandbasket/shared/server/phone-countries";
import { visitorPhoneCountry } from "@brandbasket/shared/server/phone-defaults";
import { NewLeadForm } from "@/components/new-lead-form";
import { PageHeader } from "@/components/console/page-header";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { createLeadAction } from "./actions";

export const metadata: Metadata = { title: "Add lead" };

export default async function NewLeadPage(): Promise<ReactElement> {
  await requireStaffAccess();
  const defaultPhoneCountry = visitorPhoneCountry(await headers());

  return (
    <>
      <PageHeader
        back={{ href: "/leads", label: "Leads" }}
        title={
          <>
            Add a <em>lead.</em>
          </>
        }
        meta="An enquiry by phone, email or in person. It joins the journey as new, like the website form."
      />
      <div className="mt-10 border-t border-line pt-10">
        <NewLeadForm
          action={createLeadAction}
          phoneCountries={phoneCountryOptions()}
          defaultPhoneCountry={defaultPhoneCountry}
        />
      </div>
    </>
  );
}
