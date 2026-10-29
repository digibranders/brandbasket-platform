"use server";

import { redirect } from "next/navigation";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { INTAKE_SUMMARY_STEP, personalizeHref } from "@/lib/intake/links";
import { questionAfter, type IntakeField } from "@brandbasket/shared/lib/intake/questions";
import { SERVICE_KEY_OF } from "@/lib/first-look";
import { membershipHrefWithServices, readSelectedServices, servicesAfterToggle } from "@/lib/membership";
import { requireCustomerAccess, type CustomerAccessOptions } from "@/lib/server/customer-access";
import { completeIntake, loadIntake, saveIntakeAnswer, saveIntakeServices } from "@/lib/server/intake";

/** Like the plan's pages: open to the account a sign-up opens, before and while it is held on its first payment. */
const ACCESS: CustomerAccessOptions = { listingAccount: "allow", membershipCheckout: "allow" };

export interface IntakeFormState {
  readonly error: string | null;
}

const text = (value: FormDataEntryValue | null): string => (typeof value === "string" ? value : "");

/** The basket posted with the form: only catalogue ids survive, the website alone when none is named. */
function basketOf(formData: FormData): ReturnType<typeof readSelectedServices> {
  return readSelectedServices({ services: text(formData.get("services")) });
}

/**
 * Saves one answer and moves on to the next question that applies, or to the summary after the last. The business is the
 * session's, never the form's; the answer is checked against the question's own options; a refused answer comes back
 * as a message beside the question and writes nothing.
 */
export async function saveAnswerAction(_previous: IntakeFormState, formData: FormData): Promise<IntakeFormState> {
  const { tenant } = await requireCustomerAccess(ACCESS);
  const services = basketOf(formData);
  const field = text(formData.get("field"));
  const outcome = await saveIntakeAnswer(tenant, {
    field,
    values: formData.getAll("value").filter((value): value is string => typeof value === "string"),
    services,
    now: new Date(),
  });
  if (outcome.kind === "refused") return { error: outcome.message };
  const { answers } = await loadIntake(tenant);
  const next = questionAfter(services.map((id) => SERVICE_KEY_OF[id]), answers, field as IntakeField);
  redirect(personalizeHref(services, next === null ? INTAKE_SUMMARY_STEP : next.field));
}

/** Adds a service to the basket, or takes it out (never the last one), and stays on the summary: new questions appear there. */
export async function toggleServiceAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCustomerAccess(ACCESS);
  const services = basketOf(formData);
  const [toggled] = readBundleSelection([text(formData.get("toggle"))]);
  const next = toggled === undefined ? services : servicesAfterToggle(services, toggled);
  await saveIntakeServices(tenant, next, new Date());
  redirect(personalizeHref(next, INTAKE_SUMMARY_STEP));
}

/** Continue to checkout from the summary: the questions are done, answered or not, and the plan's page opens on this basket. */
export async function continueToCheckoutAction(formData: FormData): Promise<void> {
  const { tenant } = await requireCustomerAccess(ACCESS);
  const services = basketOf(formData);
  await saveIntakeServices(tenant, services, new Date());
  await completeIntake(tenant, new Date());
  redirect(membershipHrefWithServices("managed", services));
}

/** Skip for now: nothing more is asked, and the checkout opens on the same basket. The kickoff call covers what was left. */
export async function skipIntakeAction(formData: FormData): Promise<void> {
  await continueToCheckoutAction(formData);
}
