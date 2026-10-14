import type { Metadata } from "next";
import type { ReactElement } from "react";
import { PageHeader } from "@/components/console/page-header";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage(): Promise<ReactElement> {
  const { staff } = await requireStaffAccess();
  return (
    <PageHeader
      title="You don’t have access to this"
      meta={`Your role is ${staff.role}. Money, pricing, invoices and the access log are for finance and admin staff. Ask an admin if you need them.`}
    />
  );
}
