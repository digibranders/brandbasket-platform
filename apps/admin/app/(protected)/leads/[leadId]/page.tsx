import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { readEnquiryQuery } from "@/lib/enquiries";
import { enquiryListHref } from "@/lib/enquiries-model";
import { requireStaffAccess } from "@/lib/server/staff-access";

/**
 * An enquiry's own address (the link from the add form, an old bookmark) opens it in the list's side panel, which is a full
 * sheet on a phone. The panel loads it and writes the view to the access log.
 */
export default async function EnquiryPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly leadId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<never> {
  await requireStaffAccess();
  const { leadId } = await params;
  if (!z.uuid().safeParse(leadId).success) notFound();
  const query = readEnquiryQuery(await searchParams);
  redirect(enquiryListHref({ ...query, bucket: "all" }, leadId));
}
