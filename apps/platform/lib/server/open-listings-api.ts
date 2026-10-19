import "server-only";
import type { VisibleOpenListing } from "@brandbasket/db";
import { isPlaceId } from "@brandbasket/db/place-id";
import {
  OPEN_LISTINGS_CONTRACT_VERSION,
  OPEN_LISTINGS_MAX_PAGE,
  type OpenListingTuple,
  type OpenListingsPage,
  type OpenListingsVersion,
} from "@brandbasket/shared/lib/directory/open-listings-contract";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

/*
 * The directory's open-data and surveyed businesses for the marketing website's server (the contract is
 * packages/shared/src/lib/directory/open-listings-contract.ts). Server-to-server only, with LEADS_API_TOKEN: the rows
 * are public on the directory one page at a time, but the whole set in one go is not for anyone else to copy.
 */

export interface OpenListingsDeps {
  readonly token: string | null;
  readonly readVersion: () => Promise<string>;
}

export interface OpenListingsPageDeps extends OpenListingsDeps {
  readonly readPage: (page: { readonly after: string | null; readonly limit: number }) => Promise<readonly VisibleOpenListing[]>;
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function refused(request: Request, token: string | null): Response | null {
  if (token === null) {
    console.error("LEADS_API_TOKEN is not set, so the website cannot reach the directory.");
    return reply(503, { error: "The directory is not available right now." });
  }
  if (!hasValidWebsiteToken(request, token)) return reply(401, { error: "Not authorised." });
  return null;
}

export function toTuple(listing: VisibleOpenListing): OpenListingTuple {
  return [
    listing.name, listing.categorySlug, listing.citySlug, listing.areaSlug, listing.address, listing.lat, listing.lon,
    listing.website, listing.source, listing.placeId, listing.urlCitySlug, listing.urlSlug,
    listing.phone?.e164 ?? null, listing.phone?.foundOn ?? null, listing.phone?.checkedOn ?? null,
    listing.phone?.whatsapp ?? false,
  ];
}

export async function handleOpenListingsVersion(request: Request, deps: OpenListingsDeps): Promise<Response> {
  const refusal = refused(request, deps.token);
  if (refusal !== null) return refusal;
  try {
    const body: OpenListingsVersion = { contract: OPEN_LISTINGS_CONTRACT_VERSION, version: await deps.readVersion() };
    return reply(200, body);
  } catch (error) {
    console.error("[brandbasket:directory] GET /api/directory/open-listings/version failed", errorLogInfo(error));
    return reply(503, { error: "Listings are unavailable right now." });
  }
}

function parsePage(url: URL): { readonly after: string | null; readonly limit: number } | null {
  const after = url.searchParams.get("after");
  const limitText = url.searchParams.get("limit");
  if (limitText !== null && !/^[1-9][0-9]*$/.test(limitText)) return null;
  const limit = limitText === null ? OPEN_LISTINGS_MAX_PAGE : Number(limitText);
  if (after !== null && !isPlaceId(after)) return null;
  if (!Number.isInteger(limit) || limit < 1 || limit > OPEN_LISTINGS_MAX_PAGE) return null;
  return { after, limit };
}

export async function handleOpenListingsPage(request: Request, deps: OpenListingsPageDeps): Promise<Response> {
  const refusal = refused(request, deps.token);
  if (refusal !== null) return refusal;
  const page = parsePage(new URL(request.url));
  if (page === null) return reply(400, { error: `after must be a place id and limit 1 to ${OPEN_LISTINGS_MAX_PAGE}.` });
  try {
    // Version and page are separate reads. An import committing between them gives a page stamped with the older
    // version: the website re-reads pages whose versions disagree, and its next version poll catches up.
    const version = await deps.readVersion();
    const rows = await deps.readPage(page);
    const body: OpenListingsPage = {
      contract: OPEN_LISTINGS_CONTRACT_VERSION,
      version,
      listings: rows.map(toTuple),
      next: rows.length === page.limit ? (rows.at(-1)?.placeId ?? null) : null,
    };
    return reply(200, body);
  } catch (error) {
    console.error("[brandbasket:directory] GET /api/directory/open-listings failed", errorLogInfo(error));
    return reply(503, { error: "Listings are unavailable right now." });
  }
}
