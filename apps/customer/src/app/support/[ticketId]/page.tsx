import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";

/** The old ticket link in emails already sent (`/support/<ticket id>`) opens the request's page. */
export default async function SupportTicketRedirect({ params }: { readonly params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const id = z.uuid().safeParse(ticketId);
  if (!id.success) notFound();
  permanentRedirect(`/requests/${id.data}`);
}
