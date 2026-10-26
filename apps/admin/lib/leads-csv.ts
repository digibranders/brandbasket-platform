import type { Lead } from "@brandbasket/db";
import { textCell } from "@brandbasket/shared/lib/billing/invoice-register";
import { LEAD_SOURCE_LABELS, websitePlanLabels } from "@brandbasket/shared/lib/lead-source";
import { LEAD_STATUS_LABELS } from "@brandbasket/shared/lib/lead-status";

const HEADER = ["Received", "Business", "Name", "Email", "Phone", "City", "Source", "Wants", "Status", "Owner"];

/** The enquiries as CSV. Every cell is text a person typed or a label, so each goes through textCell. */
export function leadsCsv(leads: readonly Lead[], ownerName: (staffUserId: string) => string): string {
  const rows = leads.map((lead) =>
    [
      lead.createdAt.toISOString(),
      lead.businessName,
      lead.name,
      lead.email,
      lead.phone ?? "",
      lead.city ?? "",
      LEAD_SOURCE_LABELS[lead.source],
      websitePlanLabels(lead.plans).join(" + "),
      LEAD_STATUS_LABELS[lead.status],
      lead.assignedStaffId === null ? "" : ownerName(lead.assignedStaffId),
    ]
      .map(textCell)
      .join(","),
  );
  return `${[HEADER.join(","), ...rows].join("\r\n")}\r\n`;
}
