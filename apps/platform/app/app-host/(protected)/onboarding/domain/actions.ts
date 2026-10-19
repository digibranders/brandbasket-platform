"use server";

import { DomainTakenError, savePrimaryDomain } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseDomainForm,
  readSubdomainName,
  reservedHostnamesFrom,
  temporarySubdomainFor,
  clientSiteBaseDomain,
} from "@brandbasket/shared/lib/onboarding/domain-form";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { hrefAfter } from "@brandbasket/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { saveOnboardingStep, type StepProblem } from "@/lib/server/onboarding";
import { siteConfig } from "@brandbasket/shared/lib/site-config";

/** Never says which business holds the hostname. */
function describeDomainError(error: unknown): StepProblem | null {
  if (error instanceof DomainTakenError) {
    return {
      message:
        "That domain is already connected to another website. Tell us on your project page and we'll sort it out.",
      field: "domain",
    };
  }
  return null;
}

/** Step 04: saves the domain and the ownership confirmation, marks the step done and moves on to the review. */
export async function saveDomainStep(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const { tenant } = await requireCustomerAccess();

  const env = serverEnv();
  const baseDomain = clientSiteBaseDomain();
  const reserved = [
    ...reservedHostnamesFrom([siteConfig.url, siteConfig.appUrl, env.APP_ORIGIN, env.ADMIN_ORIGIN]),
    ...(baseDomain === null ? [] : [baseDomain]),
  ];
  const parsed = parseDomainForm(formData, reserved);
  if (!parsed.success) return refusedStepState(parsed, formData);
  const { hostname } = parsed.data;

  const problem = await saveOnboardingStep(
    getAppDb(),
    tenant,
    "domain",
    async (tx) => {
      await savePrimaryDomain(tx, { hostname, ownerConfirmedAt: new Date() });
      return null;
    },
    describeDomainError,
  );
  if (problem !== null) return refusedStepState(problem, formData);

  // The step list in the layout reads what is done, so it must be read again or this step stays unticked.
  revalidatePath("/onboarding", "layout");
  redirect(hrefAfter("domain"));
}

/**
 * Step 04, for a business with no domain of their own yet: a free `<name>.<base domain>` address, so they are never
 * blocked from sending onboarding while waiting to register one. The customer chooses the name (the page offers one made
 * from the business name); it is read by readSubdomainName (letters, numbers and hyphens, never one of the names kept for
 * us) and refused too if it is one of the platform's own hosts or already another business's. It is only for now: the
 * form's own-domain box replaces it whenever they have registered one.
 */
export async function useTemporarySubdomainAction(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const { tenant } = await requireCustomerAccess();
  // Not offered until the deployment says which domain the addresses are made on (CLIENT_SITE_BASE_DOMAIN).
  const baseDomain = clientSiteBaseDomain();
  if (baseDomain === null) return refusedStepState({ message: "We can’t set up a free address. Enter your own domain instead.", field: "domain" }, formData);

  const typed = formData.get("name");
  const reading = readSubdomainName(typeof typed === "string" ? typed : "", baseDomain);
  if (!reading.ok) return refusedStepState({ message: reading.message, field: "name" }, formData);
  const hostname = temporarySubdomainFor(reading.name);
  // Our own hosts, wherever they sit under the base domain (the app and the console, if the base is the company's own domain).
  const env = serverEnv();
  if (reservedHostnamesFrom([siteConfig.url, siteConfig.appUrl, env.APP_ORIGIN, env.ADMIN_ORIGIN]).includes(hostname)) {
    return refusedStepState({ message: "That name is kept for us. Choose another.", field: "name" }, formData);
  }

  const problem = await saveOnboardingStep(
    getAppDb(),
    tenant,
    "domain",
    async (tx) => {
      await savePrimaryDomain(tx, { hostname, ownerConfirmedAt: new Date() });
      return null;
    },
    (error) =>
      error instanceof DomainTakenError ? { message: `${hostname} is already taken. Try another name.`, field: "name" } : null,
  );
  if (problem !== null) return refusedStepState(problem, formData);

  // The step list in the layout reads what is done, so it must be read again or this step stays unticked.
  revalidatePath("/onboarding", "layout");
  redirect(hrefAfter("domain"));
}
