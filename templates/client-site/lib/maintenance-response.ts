import { maintenanceMarkup, type MaintenanceDetails } from "./maintenance-page";

/** Seconds a visitor or crawler is told to wait before trying again: payment can come at any time, so not long. */
const RETRY_AFTER_SECONDS = "300";

/**
 * The notice as a complete HTML document. It is built from the same markup as components/maintenance.tsx but as a string,
 * because Next refuses react-dom/server inside the proxy ("You're importing a component that imports react-dom/server").
 */
function maintenanceHtml(details: MaintenanceDetails): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Under maintenance</title><style>html,body{margin:0}</style></head><body>${maintenanceMarkup(details)}</body></html>`;
}

/**
 * The whole site, answered while the plan has ended: the maintenance page as a complete document, with 503 and
 * `Retry-After` so search engines treat it as a pause and keep the real pages, and `noindex` and `no-store` so nothing
 * remembers the notice as the site. `details` come from the site's hosting settings (`maintenanceDetails()`).
 */
export function maintenanceResponse(details: MaintenanceDetails = {}): Response {
  return new Response(maintenanceHtml(details), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": RETRY_AFTER_SECONDS,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
