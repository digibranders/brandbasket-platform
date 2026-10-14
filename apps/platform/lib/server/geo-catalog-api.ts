import "server-only";
import type { GeoCatalogSnapshot } from "@firstfold/db";
import { GEO_CATALOG_CONTRACT_VERSION, type GeoCatalogResponse } from "@firstfold/shared/lib/directory/geo-catalog-contract";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";
import { hasValidWebsiteToken } from "@/lib/server/website-api-auth";

/** `GET /api/directory/catalog`: the geography and category catalog for the marketing website's server (see the contract). */
export interface GeoCatalogApiDeps {
  readonly token: string | null;
  readonly readCatalog: () => Promise<GeoCatalogSnapshot>;
}

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleGeoCatalog(request: Request, deps: GeoCatalogApiDeps): Promise<Response> {
  if (deps.token === null) {
    console.error("LEADS_API_TOKEN is not set, so the website cannot reach the directory.");
    return reply(503, { error: "The directory is not available right now." });
  }
  if (!hasValidWebsiteToken(request, deps.token)) return reply(401, { error: "Not authorised." });
  try {
    const body: GeoCatalogResponse = { contract: GEO_CATALOG_CONTRACT_VERSION, ...(await deps.readCatalog()) };
    return reply(200, body);
  } catch (error) {
    console.error("[firstfold:directory] GET /api/directory/catalog failed", errorLogInfo(error));
    return reply(503, { error: "The catalog is unavailable right now." });
  }
}
