import type { Metadata } from "next";
import type { ReactElement } from "react";
import { AffiliateForm, BLANK_AFFILIATE } from "@/components/affiliate-forms";
import { PageHeader } from "@/components/console/page-header";
import { requireStaffCan } from "@/lib/server/staff-role";
import { createAffiliateAction } from "./actions";

export const metadata: Metadata = { title: "New affiliate" };

export default async function NewAffiliatePage(): Promise<ReactElement> {
  await requireStaffCan("money");
  return (
    <>
      <PageHeader
        back={{ href: "/affiliates", label: "Affiliates" }}
        title={
          <>
            New <em>affiliate.</em>
          </>
        }
        meta="Add their codes next."
      />
      <div className="mt-10 max-w-2xl border-t border-line pt-10">
        <AffiliateForm action={createAffiliateAction} initial={BLANK_AFFILIATE} editing={false} />
      </div>
    </>
  );
}
