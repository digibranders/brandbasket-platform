import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Maintenance } from "@/components/maintenance";

/** Seconds a visitor or crawler is told to wait before trying again: payment can come at any time, so not long. */
const RETRY_AFTER_SECONDS = "300";

/**
 * The whole site, answered while the plan has ended: the maintenance page as a complete document, with 503 and
 * `Retry-After` so search engines treat it as a pause and keep the real pages, and `noindex` and `no-store` so nothing
 * remembers the notice as the site. `businessName` is optional (`SITE_BUSINESS_NAME` in the site's hosting).
 */
export function maintenanceResponse(businessName?: string): Response {
  const page = renderToStaticMarkup(createElement(Maintenance, businessName === undefined ? {} : { businessName }));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Under maintenance</title></head><body style="margin:0">${page}</body></html>`;
  return new Response(html, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": RETRY_AFTER_SECONDS,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
