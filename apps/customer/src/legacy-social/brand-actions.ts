"use server";

import { reportError } from "@/lib/report";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireService, type CustomerContext } from "@/lib/guards";
import { fetchBrands } from "@/features/social/brand";
import { archiveBrand, createBrand, SocialAutoError, socialAutoSettings, type SocialAutoSettings } from "@/legacy-social/server/social-auto";
import { wordsForCode } from "@/legacy-social/lib/social/ai";
import { BRAND_COOKIE, brandIdFor, brandKeyFrom, isBrandOf, type BrandsView } from "@/features/social/brands";
import type { NewPostState } from "@/legacy-social/lib/social/new-post";

/**
 * The customer's choices about her brands: which one she is looking at, adding another, archiving one. The business comes from the
 * session and every brand named is checked against the business's own list as social-auto gives it, so no id from a form can reach
 * another business's brand. The number of brands a business may have is social-auto's to enforce; this only shows what it says.
 */

const ID = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._:-]+$/);

type Guard = { readonly ok: true; readonly tenant: Pick<CustomerContext, "businessId" | "businessName">; readonly settings: SocialAutoSettings; readonly view: BrandsView } | { readonly ok: false; readonly state: NewPostState };

const refuse = (message: string): { ok: false; state: NewPostState } => ({ ok: false, state: { status: "error", message } });

/** The signed-in customer with Social media, social-auto's settings, and the business's brands as social-auto lists them. */
async function guard(): Promise<Guard> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return refuse("Only owners and editors can change this.");
  const settings = socialAutoSettings();
  if (settings === null) return refuse("Posting is not available just now. Try again later.");
  const view = await fetchBrands(customer);
  if (view === null) return refuse("Brands are not available just now. Try again later.");
  return { ok: true, tenant: customer, settings, view };
}

async function run(what: string, work: (g: Extract<Guard, { ok: true }>) => Promise<void>): Promise<NewPostState> {
  try {
    const g = await guard();
    if (!g.ok) return g.state;
    await work(g);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.code !== null) return { status: "error", message: wordsForCode(error.code) };
    reportError(error, { area: `social.${what}` });
    return { status: "error", message: wordsForCode(null) };
  }
  revalidatePath("/social");
  revalidatePath("/social/analytics");
  return { status: "saved" };
}

async function remember(externalId: string): Promise<void> {
  (await cookies()).set(BRAND_COOKIE, externalId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

/** Looks at another of the business's brands. */
export async function selectBrandAction(formData: FormData): Promise<NewPostState> {
  const parsed = ID.safeParse(formData.get("brand"));
  if (!parsed.success) return { status: "error", message: "That brand could not be found. Reload the page." };
  return run("choose a brand", async ({ tenant, view }) => {
    const brand = view.brands.find((one) => one.externalId === parsed.data && !one.archived && isBrandOf(tenant.businessId, one.externalId));
    if (brand === undefined) throw new SocialAutoError("not one of the business's brands", 404, null, "NOT_FOUND");
    await remember(brand.externalId);
  });
}

const nameSchema = z.string().trim().min(1, "Write the brand's name.").max(80, "That name is too long.");

/** Adds a brand: a workspace of its own, with its own website, posts, pictures and approvals. The posting service refuses beyond what the business may have. */
export async function addBrandAction(formData: FormData): Promise<NewPostState> {
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { status: "error", message: name.error.issues[0]?.message ?? "Write the brand's name." };
  return run("add a brand", async ({ tenant, settings, view }) => {
    if (view.used >= view.allowed) throw new SocialAutoError("brand limit", 409, null, "BRAND_LIMIT_REACHED");
    const key = brandKeyFrom(crypto.getRandomValues(new Uint8Array(8)));
    await createBrand(settings, tenant.businessId, key, name.data);
    await remember(brandIdFor(tenant.businessId, key));
  });
}

const archiveSchema = z.object({ brand: ID, archived: z.enum(["true", "false"]) });

/** Archives a brand (nothing new is sent or drawn for it, and it frees a place) or brings it back. At least one brand stays. */
export async function archiveBrandAction(formData: FormData): Promise<NewPostState> {
  const parsed = archiveSchema.safeParse({ brand: formData.get("brand"), archived: formData.get("archived") });
  if (!parsed.success) return { status: "error", message: "That brand could not be found. Reload the page." };
  const archived = parsed.data.archived === "true";
  return run("archive a brand", async ({ tenant, settings, view }) => {
    const brand = view.brands.find((one) => one.externalId === parsed.data.brand && isBrandOf(tenant.businessId, one.externalId));
    if (brand === undefined) throw new SocialAutoError("not one of the business's brands", 404, null, "NOT_FOUND");
    if (archived && view.brands.filter((one) => !one.archived).length <= 1) throw new SocialAutoError("the last brand", 409, null, "LAST_BRAND");
    await archiveBrand(settings, brand.externalId, archived);
    // Archiving the brand being looked at sends her back to the first one that is left.
    if (archived) (await cookies()).delete(BRAND_COOKIE);
  });
}
