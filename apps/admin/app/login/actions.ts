"use server";

import { redirect } from "next/navigation";
import { typedSignInIdentifier } from "@brandbasket/shared/lib/sign-in-form";
import { finishSignIn, signInWithPassword } from "@/lib/server/sign-in";
import type { StaffCodeFormState, StaffSignInFormState } from "@/lib/staff-sign-in-form";
import { checkHuman } from "@brandbasket/shared/server/turnstile-request";

export async function signInStaff(_previous: StaffSignInFormState, formData: FormData): Promise<StaffSignInFormState> {
  const human = await checkHuman(formData, "staff_sign_in");
  if (!human.ok) return { status: "error", message: human.message, email: typedSignInIdentifier(formData) };
  return signInWithPassword(formData);
}

export async function confirmStaffCode(_previous: StaffCodeFormState, formData: FormData): Promise<StaffCodeFormState> {
  const outcome = await finishSignIn(formData);
  if (outcome.status === "signed-in") redirect("/");
  return outcome;
}
