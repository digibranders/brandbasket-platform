import type { Metadata } from "next";
import type { ReactElement } from "react";
import { PageHeader } from "@/components/console/page-header";
import { requireStaffAccess } from "@/lib/server/staff-access";

export const metadata: Metadata = { title: "No access" };

export default async function NoAccessPage(): Promise<ReactElement> {
  await requireStaffAccess();
  return <PageHeader title="You do not have access to this" meta="This account cannot open that page. Ask the person who runs Brandbasket to check it." />;
}
