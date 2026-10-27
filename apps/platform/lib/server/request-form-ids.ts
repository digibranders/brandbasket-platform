import "server-only";
import { notFound } from "next/navigation";
import { z } from "zod";

const idSchema = z.uuid();

/**
 * The request and its ticket named by a Requests form. Both are only ever ids: the business comes from the session, and the
 * database checks the rest. An id that is not an id is a not-found.
 */
export function readRequestIds(formData: FormData): { readonly requestId: string; readonly ticketId: string } {
  const requestId = idSchema.safeParse(formData.get("requestId"));
  const ticketId = idSchema.safeParse(formData.get("ticketId"));
  if (!requestId.success || !ticketId.success) notFound();
  return { requestId: requestId.data, ticketId: ticketId.data };
}
