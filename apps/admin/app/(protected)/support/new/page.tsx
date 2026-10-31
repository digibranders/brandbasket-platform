import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { z } from "zod";
import { listClients } from "@brandbasket/db";
import { PageHeader } from "@/components/console/page-header";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { NewRequestForm } from "./new-request-form";

export const metadata: Metadata = { title: "New request" };

interface NewRequestPageProps {
  readonly searchParams: Promise<{ readonly businessId?: string | string[] }>;
}

export default async function NewRequestPage({ searchParams }: NewRequestPageProps): Promise<ReactElement> {
  const { user } = await requireStaffAccess();
  await logStaffAccess({ staffUserId: user.id, action: "support.new", targetType: "support_ticket" });
  const { businessId } = await searchParams;
  const preselected = z.uuid().safeParse(businessId);
  // Paying and not yet paid businesses (contract C3b): staff open requests for anyone they are talking to.
  const clients = await listClients(getStaffDb(), { include: ["paying", "not_paid"] });
  return (
    <>
      <PageHeader
        title="New request for a client"
        back={{ href: "/support", label: "Requests" }}
        meta="Write down what they asked for on the call. They get an email with a link, and can reply from their dashboard."
      />
      <div className="mt-8 max-w-2xl">
        <NewRequestForm
          clients={clients.map((client) => ({ value: client.businessId, label: client.owner === null ? client.businessName : `${client.businessName} · ${client.owner.name}` }))}
          preselected={preselected.success ? preselected.data : ""}
          submissionKey={randomUUID()}
        />
      </div>
    </>
  );
}
