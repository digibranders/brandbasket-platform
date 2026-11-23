import "server-only";
import type { LeadStatus, LeadStatusChange, StaffLeadStatus } from "@brandbasket/db";
import { canStaffChangeLeadStatus, readStaffLeadStatus } from "@brandbasket/shared/lib/lead-status";
import { z } from "zod";

export type EnquiryStatusResult = { readonly ok: true; readonly previous: LeadStatus; readonly current: LeadStatus } | { readonly ok: false; readonly message: string };
export type SetupLinkResult = { readonly ok: true; readonly email: string } | { readonly ok: false; readonly message: string };

export interface EnquiryActionDependencies<Granted extends { readonly user: { readonly id: string } }> {
  readonly requireStaff: () => Promise<Granted>;
  readonly readLead: (leadId: string) => Promise<{ readonly status: LeadStatus; readonly email: string; readonly hasBusiness: boolean } | null>;
  readonly setStatus: (leadId: string, status: StaffLeadStatus) => Promise<LeadStatusChange>;
  readonly sendLink: (leadId: string, staffUserId: string) => Promise<void>;
  readonly record: (granted: Granted, entry: { readonly kind: string; readonly summary: string; readonly data: Record<string, string> }) => Promise<void>;
  readonly revalidate: (leadId: string) => void | Promise<void>;
}

export interface EnquiryActions {
  /** New to talking (`call_done`). Status only: nobody is emailed, so the caller offers Undo. */
  readonly markContacted: (leadId: string) => Promise<EnquiryStatusResult>;
  readonly markLost: (leadId: string) => Promise<EnquiryStatusResult>;
  /** The Undo of the two above: back to the status the enquiry had. A lead the system has moved on since is not touched. */
  readonly restore: (leadId: string, to: string) => Promise<EnquiryStatusResult>;
  /** Emails the setup link (the existing `sendSetupLink`), for the confirm dialog and the bulk bar. */
  readonly sendSetupLink: (leadId: string) => Promise<SetupLinkResult>;
}

const NOT_FOUND = "That enquiry could not be found.";
const MOVED_ON = "This enquiry has moved on. Reload the list and try again.";
const idSchema = z.uuid();

export function createEnquiryActions<Granted extends { readonly user: { readonly id: string } }>(deps: EnquiryActionDependencies<Granted>): EnquiryActions {
  async function change(leadId: string, summary: string, choose: (current: LeadStatus) => string): Promise<EnquiryStatusResult> {
    const granted = await deps.requireStaff();
    if (!idSchema.safeParse(leadId).success) return { ok: false, message: NOT_FOUND };
    try {
      const lead = await deps.readLead(leadId);
      if (lead === null) return { ok: false, message: NOT_FOUND };
      const target = choose(lead.status);
      const wanted = readStaffLeadStatus(target);
      if (wanted === null) return { ok: false, message: target };
      const outcome = await deps.setStatus(leadId, wanted);
      if (outcome === "not-found") return { ok: false, message: NOT_FOUND };
      if (outcome === "system-set") return { ok: false, message: MOVED_ON };
      await deps.record(granted, { kind: "lead.status_changed", summary, data: { leadId, status: wanted } });
      await deps.revalidate(leadId);
      return { ok: true, previous: lead.status, current: wanted };
    } catch {
      return { ok: false, message: "The change did not save. Nothing was changed." };
    }
  }

  return {
    markContacted: (leadId) => change(leadId, "Marked contacted", (current) => (current === "new" ? "call_done" : "Only a new enquiry can be marked contacted.")),
    markLost: (leadId) => change(leadId, "Marked lost", (current) => (canStaffChangeLeadStatus(current) && current !== "lost" ? "lost" : "This enquiry cannot be marked lost.")),
    restore: (leadId, to) => change(leadId, "Restored an enquiry status", () => (readStaffLeadStatus(to) === null ? "That status is not one an enquiry can go back to." : to)),
    sendSetupLink: async (leadId) => {
      const granted = await deps.requireStaff();
      if (!idSchema.safeParse(leadId).success) return { ok: false, message: NOT_FOUND };
      try {
        const lead = await deps.readLead(leadId);
        if (lead === null) return { ok: false, message: NOT_FOUND };
        if (lead.hasBusiness) return { ok: false, message: "This person already has a website. Open the client instead." };
        await deps.sendLink(leadId, granted.user.id);
        await deps.record(granted, { kind: "lead.setup_link_sent", summary: "Sent the setup link", data: { leadId } });
        await deps.revalidate(leadId);
        return { ok: true, email: lead.email };
      } catch {
        // The earlier link is revoked before the new one is made, so a failure here can leave the person without a working link.
        return { ok: false, message: "The setup link may not have gone. The earlier link may no longer work. Open the enquiry and try again." };
      }
    },
  };
}
