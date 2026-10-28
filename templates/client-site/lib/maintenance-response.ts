/** Seconds a visitor or crawler is told to wait before trying again: payment can come at any time, so not long. */
const RETRY_AFTER_SECONDS = "300";

/** Escapes text for HTML: the business name comes from the site's own settings, but it is cheap to be safe. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * The notice as a plain HTML string. It is not rendered from components/maintenance.tsx because Next refuses react-dom/server
 * inside the proxy ("You're importing a component that imports react-dom/server"), so this is a simpler version of the same
 * page, without the illustration. The layout still shows the full component.
 */
function maintenanceHtml(businessName: string | undefined): string {
  const headline = businessName === undefined ? "We'll be back soon" : `${escapeHtml(businessName)} is taking a short break`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>Under maintenance</title></head><body style="margin:0;background:#f6f1ec"><main style="min-height:100vh;display:grid;place-items:center;padding:2rem;text-align:center;font-family:Georgia,'Times New Roman',serif;color:#0c1e2e;background:#f6f1ec"><div style="max-width:30rem"><h1 style="font-size:1.75rem;font-weight:500;margin:0">${headline}</h1><p style="margin:.75rem 0 0;line-height:1.6;color:#4b5b67;font-family:system-ui,sans-serif">We&rsquo;re making a few improvements. Please check back shortly.</p></div></main></body></html>`;
}

/**
 * The whole site, answered while the plan has ended: the maintenance page as a complete document, with 503 and
 * `Retry-After` so search engines treat it as a pause and keep the real pages, and `noindex` and `no-store` so nothing
 * remembers the notice as the site. `businessName` is optional (`SITE_BUSINESS_NAME` in the site's hosting).
 */
export function maintenanceResponse(businessName?: string): Response {
  return new Response(maintenanceHtml(businessName), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": RETRY_AFTER_SECONDS,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}
