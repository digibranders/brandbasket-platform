import "server-only";
import { getPayload } from "payload";
import config from "@/payload.config";
import { getCustomerBilling } from "@/lib/server/customer-access";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { serverEnv } from "@/lib/server/env";
import { BodyTooLargeError, readLimitedBody } from "@/lib/server/read-limited-body";
import { allowsAnyLocalHost, isAppOrigin, resolveSurface, type SurfaceOrigins } from "@/lib/surfaces";
import { parseUploadFileName } from "@/lib/uploads/file-name";
import {
  isAcceptedUploadType,
  MAX_UPLOAD_BYTES,
  TOO_LARGE_MESSAGE,
  UPLOAD_FILE_NAME_HEADER,
} from "@/lib/uploads/limits";

/**
 * `POST /api/content-media-uploads`: a customer's own fresh photo, straight into a Payload `media` document —
 * stamped with `businessId` taken only from their session, never from client input. Built for this plan's Task 6
 * (docs/superpowers/plans/2026-09-17-payload-cms-migration.md), which explicitly leaves the gallery-upload-scope
 * decision to the implementer: the old gallery only let customers add photos already uploaded during onboarding
 * (`@brandbasket/db`'s onboarding media_assets table), a different store from Payload's own `media` collection the
 * new, Payload-backed gallery references. Rather than bridge two unrelated stores, this route lets customers
 * upload straight into Payload's `media` collection — the same collection every other image in this app now goes
 * through — which is simpler and, now that `Media` has working upload handling "for free" (see collections/Media.ts),
 * a reasonable capability to add rather than withhold. Shared by the gallery panel (a fresh gallery photo) and the
 * blog post edit form (a cover image): both just need "store an image for this business, hand back its id," and
 * neither writes anything else here — attaching the resulting id to a gallery item or a post is each caller's own
 * separate, ownership-checked action.
 *
 * A route handler, not a server action, for the same reason app/api/admin-content-media/route.ts is one: server
 * actions keep Next's default 1 MB body limit, and this reuses that route's body-limit machinery (readLimitedBody,
 * MAX_UPLOAD_BYTES) and accepted-type list (lib/uploads/limits.ts).
 *
 * Unlike the admin route (staff, blanket access, `businessId` trusted from a header because the single-admin model
 * already gives staff access to every business), this one is customer-facing: `businessId` is *only* ever
 * `getCustomerTenant()`'s own tenant id, and a write requires billing access and the Managed Website service,
 * the same rule `requireWebsiteAccess()` (lib/server/billing.ts) enforces for the website's other mutations, replicated here
 * without its `redirect("/login")`: a redirect response is useless to a `fetch()` caller (the browser would follow
 * it and try to parse the login page's HTML as JSON), so this checks the same underlying session + billing state
 * and answers a plain JSON 401/402 instead.
 *
 * Like /api/uploads and /api/admin-content-media, this lives under /api/, which proxy.ts's matcher skips — so this
 * route is reachable on any host unless it checks itself, hence the explicit Host check below.
 */
export async function POST(request: Request): Promise<Response> {
  const rawHost = request.headers.get("host");
  // The same hosts the proxy answers the dashboard on: its own, and under `next dev` any local address.
  const origins: SurfaceOrigins = {
    app: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
  };
  if (resolveSurface(rawHost, origins) !== "app") {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  if (!isAppOrigin(request.headers.get("origin"), rawHost, origins)) {
    return Response.json(
      { error: "That upload didn't come from your dashboard. Reload the page and try again." },
      { status: 403 },
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength === null || !/^\d{1,15}$/.test(declaredLength)) {
    return Response.json({ error: "Something went wrong with that upload. Try again." }, { status: 400 });
  }
  if (Number(declaredLength) > MAX_UPLOAD_BYTES) {
    return Response.json({ error: TOO_LARGE_MESSAGE }, { status: 413 });
  }

  const tenant = await getCustomerTenant();
  if (tenant === null) {
    return Response.json({ error: "Your session has ended. Sign in again, then try the upload." }, { status: 401 });
  }

  const billing = await getCustomerBilling(tenant.userId, tenant.businessId);
  if (!billing.hasAccess || !billing.hasWebsite) {
    return Response.json({ error: "This needs an active plan. Check Billing, then try again." }, { status: 402 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!isAcceptedUploadType(contentType)) {
    return Response.json({ error: "Choose a JPEG, PNG or WEBP image." }, { status: 415 });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBody(request.body, MAX_UPLOAD_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return Response.json({ error: TOO_LARGE_MESSAGE }, { status: 413 });
    throw error;
  }
  if (bytes.byteLength === 0) {
    return Response.json({ error: "That file is empty." }, { status: 422 });
  }

  const filename = parseUploadFileName(request.headers.get(UPLOAD_FILE_NAME_HEADER));

  const payload = await getPayload({ config });
  let media: { readonly id: string | number };
  try {
    media = await payload.create({
      collection: "media",
      data: { businessId: tenant.businessId },
      file: { data: Buffer.from(bytes), mimetype: contentType, name: filename, size: bytes.byteLength },
      overrideAccess: true,
    });
  } catch {
    return Response.json(
      { error: "Something went wrong with that upload. Reload the page and try again." },
      { status: 422 },
    );
  }

  return Response.json({ media: { id: String(media.id) } }, { status: 201 });
}
