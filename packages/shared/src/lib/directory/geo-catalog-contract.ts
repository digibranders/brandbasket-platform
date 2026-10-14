import type { GeoCatalogSnapshot } from "@fynix/db";

/*
 * What GET /api/directory/catalog sends the marketing website's server (with LEADS_API_TOKEN): the whole geography and
 * category catalog, switched-off rows included, so the website decides what to hide. The website keeps its own copy of
 * this shape (lib/geo-catalog-contract.ts) and parses what arrives, so a change here is a new contract version.
 */
export const GEO_CATALOG_CONTRACT_VERSION = 1;

export interface GeoCatalogResponse extends GeoCatalogSnapshot {
  readonly contract: typeof GEO_CATALOG_CONTRACT_VERSION;
}
