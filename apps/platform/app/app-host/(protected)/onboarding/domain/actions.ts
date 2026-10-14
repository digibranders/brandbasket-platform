"use server";

import { randomBytes } from "node:crypto";
import { DomainTakenError, savePrimaryDomain, slugify } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  parseDomainForm,
  reservedHostnamesFrom,
  temporarySubdomainFor,
  clientSiteBaseDomain,
} from "@fynix/shared/lib/onboarding/domain-form";
import { refusedStepState, type StepFormState } from "@/lib/onboarding/form-state";
import { hrefAfter } from "@fynix/shared/lib/onboarding/steps";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { saveOnboardingStep, type StepProblem } from "@/lib/server/onboarding";
import { siteConfig } from "@fynix/shared/lib/site-config";

const SUBDOMAIN_ATTEMPTS = 5;
const SUBDOMAIN_SUFFIX_BYTES = 3;

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
 * Step 04, for a business with no domain of their own yet: a free `<slug>.<base domain>` address, so they are never
 * blocked from sending onboarding while waiting to register one. The slug is generated fresh from the business
 * name (not read from `businesses.slug`, so no new read of that table is needed) and retried with a short random
 * disambiguator on a collision, the same shape insertBusiness in packages/db uses for the business slug itself.
 */
export async function useTemporarySubdomainAction(_previous: StepFormState, formData: FormData): Promise<StepFormState> {
  const { tenant } = await requireCustomerAccess();
  // Not offered until the deployment says which domain the addresses are made on (CLIENT_SITE_BASE_DOMAIN).
  const baseDomain = clientSiteBaseDomain();
  if (baseDomain === null) return refusedStepState({ message: "We can’t set up a temporary address. Enter your own domain instead.", field: "domain" }, formData);
  const base = slugify(tenant.businessName);

  const problem = await saveOnboardingStep(getAppDb(), tenant, "domain", async (tx) => {
    for (let attempt = 0; attempt < SUBDOMAIN_ATTEMPTS; attempt += 1) {
      const hostname =
        attempt === 0
          ? temporarySubdomainFor(base)
          : temporarySubdomainFor(base, randomBytes(SUBDOMAIN_SUFFIX_BYTES).toString("hex"));
      try {
        await savePrimaryDomain(tx, { hostname, ownerConfirmedAt: new Date() });
        return null;
      } catch (error) {
        if (!(error instanceof DomainTakenError) || attempt === SUBDOMAIN_ATTEMPTS - 1) throw error;
      }
    }
    throw new Error(`Could not find a free ${baseDomain} address for "${tenant.businessName}"`);
  });
  if (problem !== null) return refusedStepState(problem, formData);

  // The step list in the layout reads what is done, so it must be read again or this step stays unticked.
  revalidatePath("/onboarding", "layout");
  redirect(hrefAfter("domain"));
}
