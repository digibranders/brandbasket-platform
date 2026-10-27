import { STAFF_ROLES, type StaffRole } from "@brandbasket/db";
import { z } from "zod";

/** How long an invite link works. */
export const STAFF_INVITE_EXPIRY_DAYS = 3;

export type StaffInviteParse = { readonly ok: true; readonly email: string; readonly role: StaffRole } | { readonly ok: false };

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  role: z.enum(STAFF_ROLES),
});

export function parseStaffInviteForm(formData: FormData): StaffInviteParse {
  const parsed = inviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  return parsed.success ? { ok: true, email: parsed.data.email, role: parsed.data.role } : { ok: false };
}

export function parseStaffRole(value: FormDataEntryValue | null): StaffRole | null {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value) ? (value as StaffRole) : null;
}
