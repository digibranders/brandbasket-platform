"use server";

import { redirect } from "next/navigation";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";
import { parseStaffAcceptForm, type StaffAcceptField } from "@/lib/staff-accept-form";
import { acceptStaffInvite } from "@/lib/server/staff-invite-accept";

export type StaffAcceptFormState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string; readonly field?: StaffAcceptField };

export async function acceptStaffInviteAction(_previous: StaffAcceptFormState, formData: FormData): Promise<StaffAcceptFormState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token === "" || token.length > 128) return { status: "error", message: "This link is incomplete. Open it from your email again." };
  const human = await checkHuman(formData, "staff_invite");
  if (!human.ok) return { status: "error", message: human.message };

  let form: { readonly name: string; readonly password: string } | null = null;
  if (formData.get("mode") !== "join") {
    const parsed = parseStaffAcceptForm(formData);
    if (!parsed.ok) return { status: "error", message: parsed.message, field: parsed.field };
    form = { name: parsed.name, password: parsed.password };
  }
  const outcome = await acceptStaffInvite(token, form);
  if (outcome.status === "joined") redirect("/");
  return outcome;
}
