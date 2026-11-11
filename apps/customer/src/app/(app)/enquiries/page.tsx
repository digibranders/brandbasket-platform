import type { Metadata } from "next";
import { EnquiriesScreen, type EnquiriesParams } from "@/features/enquiries/components/enquiries-screen";
import { requirePaid } from "@/lib/guards";

export const metadata: Metadata = { title: "Enquiries" };

export default async function EnquiriesPage({ searchParams }: { readonly searchParams: Promise<EnquiriesParams> }) {
  const customer = await requirePaid();
  return <EnquiriesScreen customer={customer} params={await searchParams} />;
}
