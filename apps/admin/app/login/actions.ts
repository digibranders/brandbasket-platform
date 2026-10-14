"use server";

import { redirect } from "next/navigation";
import { typedSignInIdentifier, type SignInFormState } from "@firstfold/shared/lib/sign-in-form";
import { signInWithPassword } from "@/lib/server/sign-in";
import { checkHuman } from "@firstfold/shared/server/turnstile-request";

export async function signInStaff(_previous: SignInFormState, formData: FormData): Promise<SignInFormState> {
  const human = await checkHuman(formData, "staff_sign_in");
  if (!human.ok) return { status: "error", message: human.message, email: typedSignInIdentifier(formData) };
  const outcome = await signInWithPassword(formData);
  if (outcome.status === "signed-in") redirect("/");
  return outcome;
}
