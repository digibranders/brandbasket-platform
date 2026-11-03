"use server";
// A "use server" module: every export is a public action endpoint. Only actions belong here.

import {
  DomainTakenError,
  DuplicateServiceIdError,
  listMediaAssets,
  replaceBusinessHours,
  replaceServices,
  saveBusinessProfile,
  saveProjectBrief,
  saveServiceSetup,
  savePrimaryDomain,
  ServiceNotFoundError,
  updateMediaAltText,
  withTenantScope,
} from "@brandbasket/db";
import { toStoredHours } from "@brandbasket/shared/lib/onboarding/hours";
import {
  clientSiteBaseDomain,
  parseDomainForm,
  readSubdomainName,
  reservedHostnamesFrom,
  temporarySubdomainFor,
} from "@brandbasket/shared/lib/onboarding/domain-form";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { actionFail, actionOk, type ActionFailure, type ActionResult } from "@/lib/action-result";
import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { parseForm } from "@/lib/form";
import { requirePaid, requireWebsite, type CustomerContext } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { parseBrandForm } from "./rules-brand";
import { VIEWER_MESSAGE } from "./rules-items";
import { parseBusinessForm } from "./rules-business";
import { parseContentForm } from "./rules-content";
import { parseSetupItem, setupFieldsFor, SETUP_SERVICE } from "./setup-rules";
import { removeOnboardingImage } from "./server/media";
import { saveItemStep, type StepProblem } from "./server/steps";

/*
 * Each item saves on its own: the work and the step's tick commit together, or neither does. There is no send step. The
 * project leaves onboarding when the kickoff call is held (apps/platform lib/server/kickoff-sync.ts and the console), not
 * when the last item is saved.
 */

const SAVE_FAILED = "We could not save that. Please try again.";
const CONTACT_MESSAGE = "Add a phone number or an email your customers can use.";
const SERVICES_CHANGED = "Your list of services has changed since this page loaded. Reload the page and try again.";
const DOMAIN_TAKEN = "That domain is already connected to another website. Tell us in Requests and we'll sort it out.";

/** A refused save as the action's result, with the message under the field it is about. */
function refused(problem: StepProblem): ActionFailure {
  return actionFail(problem.message, problem.field === null ? undefined : { [problem.field]: problem.message });
}

/** Runs one item's save. An unexpected failure is reported and shown as a retry, never as a saved item. */
async function attempt(area: string, work: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await work();
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area });
    return actionFail(SAVE_FAILED);
  }
}

/** A saved item: the pages that show checklist progress read fresh data (the checklist, Home, and the service pages that ask for the same answers). */
function saved(): ActionResult {
  for (const path of ["/checklist", "/", "/website", "/social", "/search"]) revalidatePath(path);
  return actionOk();
}

/** The signed-in owner or editor of a business with the website and a paid period running; null for a viewer. */
async function websiteWriter(): Promise<CustomerContext | null> {
  const customer = await requireWebsite({ write: true });
  return customer.role === "viewer" ? null : customer;
}

/** Our own hosts, which no customer may claim as their address. */
function reservedHosts(): string[] {
  const adminOrigin = process.env.ADMIN_ORIGIN?.trim() || "https://console.brandbasket.in";
  const base = clientSiteBaseDomain();
  return [...reservedHostnamesFrom([siteConfig.url, siteConfig.appUrl, serverEnv().APP_ORIGIN, adminOrigin]), ...(base === null ? [] : [base])];
}

/** Your business: the profile and the opening hours together. */
export async function saveBusinessItem(formData: FormData): Promise<ActionResult> {
  const customer = await websiteWriter();
  if (customer === null) return actionFail(VIEWER_MESSAGE);
  const parsed = parseBusinessForm(formData);
  if (!parsed.success) return refused(parsed);
  const { profile, hours } = parsed.data;
  // The team needs a way to reach the customer, so the item is not done without one.
  if (profile.phone === null && profile.email === null) return actionFail(CONTACT_MESSAGE, { phone: CONTACT_MESSAGE });

  return attempt("checklist.business", async () => {
    const problem = await saveItemStep(getAppDb(), customer.tenant, "business", async (tx) => {
      await saveBusinessProfile(tx, profile);
      // A day left "Not set" has no entry, so it is saved as no row at all.
      await replaceBusinessHours(tx, hours.map(toStoredHours));
      return null;
    });
    return problem === null ? saved() : refused(problem);
  });
}

/**
 * A service id the business does not have (removed in another tab, or never theirs) is refused by the save; the page is
 * simply out of date, so the customer is asked to reload.
 */
function describeServiceError(error: unknown): StepProblem | null {
  return error instanceof ServiceNotFoundError || error instanceof DuplicateServiceIdError ? { message: SERVICES_CHANGED, field: null } : null;
}

/** Services and prices: the services and the brief together. */
export async function saveServicesItem(formData: FormData): Promise<ActionResult> {
  const customer = await websiteWriter();
  if (customer === null) return actionFail(VIEWER_MESSAGE);
  const parsed = parseContentForm(formData);
  if (!parsed.success) return refused(parsed);
  const { services, notesForBuilder, styleLikes, referenceUrls } = parsed.data;

  return attempt("checklist.services", async () => {
    const problem = await saveItemStep(
      getAppDb(),
      customer.tenant,
      "content",
      async (tx, project) => {
        await replaceServices(tx, services);
        await saveProjectBrief(tx, project.id, { notesForBuilder, styleLikes, referenceUrls });
        return null;
      },
      describeServiceError,
    );
    return problem === null ? saved() : refused(problem);
  });
}

/**
 * Logo and photos: a description for every photo. The uploads themselves are saved as they happen (upload/route.ts). The
 * photos are read inside the transaction, so the descriptions are checked against what is really stored.
 */
export async function saveBrandItem(formData: FormData): Promise<ActionResult> {
  const customer = await websiteWriter();
  if (customer === null) return actionFail(VIEWER_MESSAGE);

  return attempt("checklist.brand", async () => {
    const problem = await saveItemStep(getAppDb(), customer.tenant, "brand", async (tx) => {
      const photos = await listMediaAssets(tx, "photo");
      const logos = await listMediaAssets(tx, "logo");
      const parsed = parseBrandForm(formData, { photoIds: photos.map((photo) => photo.id), logoCount: logos.length });
      if (!parsed.success) return { message: parsed.message, field: parsed.field };
      for (const { mediaId, altText } of parsed.data.descriptions) await updateMediaAltText(tx, mediaId, altText);
      return null;
    });
    return problem === null ? saved() : refused(problem);
  });
}

const mediaIdSchema = z.uuid({ error: "Reload the page and try again." });

/** Removes one logo or photo. Uploads go to upload/route.ts instead, which has no action body limit. */
export async function removeImageAction(mediaId: string): Promise<ActionResult> {
  const customer = await websiteWriter();
  if (customer === null) return actionFail(VIEWER_MESSAGE);
  const id = mediaIdSchema.safeParse(mediaId);
  if (!id.success) return actionFail(id.error.issues[0]?.message ?? SAVE_FAILED);

  return attempt("checklist.remove-image", async () => {
    const result = await removeOnboardingImage({ appDb: getAppDb(), storage: getMediaStorage() }, customer.tenant, id.data);
    return result.ok ? saved() : actionFail(result.message);
  });
}

/** Never says which business holds the hostname. */
function describeDomainError(error: unknown): StepProblem | null {
  return error instanceof DomainTakenError ? { message: DOMAIN_TAKEN, field: "domain" } : null;
}

/** Your web address, when the customer owns a domain: the domain and the confirmation that it is theirs. */
export async function saveDomainItem(formData: FormData): Promise<ActionResult> {
  const customer = await websiteWriter();
  if (customer === null) return actionFail(VIEWER_MESSAGE);
  const parsed = parseDomainForm(formData, reservedHosts());
  if (!parsed.success) return refused(parsed);
  const { hostname } = parsed.data;

  return attempt("checklist.domain", async () => {
    const problem = await saveItemStep(
      getAppDb(),
      customer.tenant,
      "domain",
      async (tx) => {
        await savePrimaryDomain(tx, { hostname, ownerConfirmedAt: new Date() });
        return null;
      },
      describeDomainError,
    );
    return problem === null ? saved() : refused(problem);
  });
}

/**
 * Your web address, for a business with no domain yet: a free `<name>.<base domain>` address, so nobody waits on registering
 * one. The customer chooses the name; it is refused if it is kept for us, is one of our own hosts, or is already taken. It is
 * only for now: an own domain replaces it whenever they have one.
 */
export async function chooseFreeAddressAction(formData: FormData): Promise<ActionResult> {
  const customer = await websiteWriter();
  if (customer === null) return actionFail(VIEWER_MESSAGE);
  // Not offered until the deployment says which domain the addresses are made on.
  const baseDomain = clientSiteBaseDomain();
  if (baseDomain === null) return actionFail("We can’t set up a free address. Enter your own domain instead.", { domain: "Enter your own domain instead." });

  const typed = formData.get("name");
  const reading = readSubdomainName(typeof typed === "string" ? typed : "", baseDomain);
  if (!reading.ok) return actionFail(reading.message, { name: reading.message });
  const hostname = temporarySubdomainFor(reading.name);
  if (reservedHosts().includes(hostname)) {
    const message = "That name is kept for us. Choose another.";
    return actionFail(message, { name: message });
  }

  return attempt("checklist.free-address", async () => {
    const problem = await saveItemStep(
      getAppDb(),
      customer.tenant,
      "domain",
      async (tx) => {
        await savePrimaryDomain(tx, { hostname, ownerConfirmedAt: new Date() });
        return null;
      },
      (error) => (error instanceof DomainTakenError ? { message: `${hostname} is already taken. Try another name.`, field: "name" } : null),
    );
    return problem === null ? saved() : refused(problem);
  });
}

const setupFormSchema = z.object({ key: z.enum(["accounts", "budget", "areas"]) });

/**
 * One Social & Ads or Local SEO + AEO answer. The business comes from the session; only the item's own fields are read from
 * the form. Answers are never logged.
 */
export async function saveSetupItem(formData: FormData): Promise<ActionResult> {
  const customer = await requirePaid({ write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const form = parseForm(setupFormSchema, formData);
  if (!form.ok) return form;
  const { key } = form.data;

  const values: Record<string, string> = {};
  for (const field of setupFieldsFor(key, customer.currency)) values[field.name] = String(formData.get(field.name) ?? "");
  const parsed = parseSetupItem(key, values, customer.currency);
  if (!parsed.success) return actionFail(parsed.message, { [parsed.field]: parsed.message });

  const service = SETUP_SERVICE[key];
  if (!customer.services.includes(service)) return actionFail("That item is not part of your plan.");

  return attempt("checklist.setup", async () => {
    await withTenantScope(getAppDb(), customer.tenant, (tx) =>
      saveServiceSetup(tx, { businessId: customer.businessId, service, answers: parsed.answers, now: new Date() }),
    );
    return saved();
  });
}
