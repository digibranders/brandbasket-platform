import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { PageHeader } from "@/components/console/page-header";
import { NewReferralCodeForm } from "@/components/referral-code-form";
import { findAffiliate } from "@/lib/server/affiliate-admin";
import { priceBases } from "@/lib/server/price-bases";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { createAffiliateCodeAction } from "./actions";

export const metadata: Metadata = { title: "New code" };

interface NewAffiliateCodePageProps {
  readonly params: Promise<{ readonly affiliateId: string }>;
}

export default async function NewAffiliateCodePage({ params }: NewAffiliateCodePageProps): Promise<ReactElement> {
  await requireStaffAccess();
  const { affiliateId } = await params;
  const affiliate = await findAffiliate(affiliateId);
  if (affiliate === null) notFound();

  return (
    <>
      <PageHeader
        back={{ href: `/affiliates/${affiliate.id}`, label: affiliate.name }}
        title={
          <>
            New <em>code.</em>
          </>
        }
        meta={`Every member who pays with it earns ${affiliate.name} a month.`}
      />
      <div className="mt-10 border-t border-line pt-10">
        <NewReferralCodeForm
          action={createAffiliateCodeAction.bind(null, affiliate.id)}
          priceBases={await priceBases()}
          affiliate={{ name: affiliate.name, currency: affiliate.rewardCurrency }}
        />
      </div>
    </>
  );
}
