import type { Metadata } from "next";
import type { ReactElement } from "react";
import { PageHeader } from "@/components/console/page-header";
import { NewReferralCodeForm } from "@/components/referral-code-form";
import { priceBases } from "@/lib/server/price-bases";
import { requireStaffCan } from "@/lib/server/staff-role";
import { createCouponAction } from "./actions";

export const metadata: Metadata = { title: "New coupon" };

export default async function NewCouponPage(): Promise<ReactElement> {
  await requireStaffCan("money");
  return (
    <>
      <PageHeader
        back={{ href: "/coupons", label: "Coupons" }}
        title={
          <>
            New <em>coupon.</em>
          </>
        }
        meta="Off every month."
      />
      <div className="mt-10 border-t border-line pt-10">
        <NewReferralCodeForm action={createCouponAction} priceBases={priceBases()} affiliate={null} />
      </div>
    </>
  );
}
