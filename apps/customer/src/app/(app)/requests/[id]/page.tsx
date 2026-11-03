import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RequestDetail } from "@/features/requests/components/request-detail";
import { loadChange, loadThread } from "@/features/requests/loader";
import { paymentNoticeLine } from "@/features/requests/rules";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Request" };

export default async function RequestPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const customer = await requireCustomer();
  const { id } = await params;
  const ticketId = z.uuid().safeParse(id);
  if (!ticketId.success) notFound();
  const [thread, change, query] = await Promise.all([loadThread(customer, ticketId.data), loadChange(customer, ticketId.data), searchParams]);
  // Someone else's request, another business's, or none: the same not found.
  if (thread.ok && thread.data === null) notFound();
  return (
    <RequestDetail
      customer={customer}
      ticketId={ticketId.data}
      thread={thread.ok && thread.data !== null ? { ok: true, data: thread.data } : { ok: false, error: thread.ok ? { at: new Date() } : thread.error }}
      change={change}
      notice={paymentNoticeLine(query.charge)}
      now={new Date()}
    />
  );
}
