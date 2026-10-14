import "server-only";
import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "@/payload.config";

/**
 * The blog API token a client's own website uses, from the staff side: read it to show on a client page, or
 * issue a fresh one.
 *
 * The reading half of this contract — resolving a token to a business and listing its posts — lives in the
 * platform app, which serves the endpoint. Only token management belongs here.
 */

/** 32 bytes of hex. Long enough that guessing is hopeless, short enough to paste into an env var. */
const TOKEN_BYTES = 32;

function newSiteApiToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/** The token currently issued to a business, or null when staff have not generated one yet. */
export async function getSiteApiToken(businessId: string): Promise<string | null> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "tenants",
    where: { businessId: { equals: businessId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const tenant = (result.docs as unknown as readonly { id: string | number; siteApiToken?: unknown }[])[0];
  if (tenant === undefined) return null;
  return typeof tenant.siteApiToken === "string" && tenant.siteApiToken !== "" ? tenant.siteApiToken : null;
}

/**
 * Issues a fresh token for a business, replacing any existing one.
 *
 * Rotation is destructive by design: the client's own website keeps sending the old token until someone redeploys
 * it with the new value, so its blog goes blank in between. That is the right trade for a credential, but staff
 * need to know it, which is what the button's copy on the client page says.
 */
export async function rotateSiteApiToken(businessId: string): Promise<string> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "tenants",
    where: { businessId: { equals: businessId } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });
  const tenant = (result.docs as unknown as readonly { id: string | number }[])[0];
  if (tenant === undefined) throw new Error(`No Payload tenant exists for business ${businessId}`);

  const token = newSiteApiToken();
  await payload.update({ collection: "tenants", id: tenant.id, data: { siteApiToken: token }, overrideAccess: true });
  return token;
}
