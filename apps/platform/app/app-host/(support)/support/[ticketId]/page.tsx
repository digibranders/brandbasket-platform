import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requestHref } from "@/lib/requests/links";

/** The old ticket page. The conversation opens in Requests with its whole history; this keeps old links (and old emails) working. */
export default async function SupportRequest({ params }: { readonly params: Promise<{ ticketId: string }> }): Promise<never> {
  const { ticketId } = await params;
  if (!z.uuid().safeParse(ticketId).success) notFound();
  redirect(requestHref(ticketId));
}
