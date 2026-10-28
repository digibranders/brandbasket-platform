import type { NextConfig } from "next";
import { vercelProductionRequirements } from "@brandbasket/shared/lib/production-requirements";
import { withPayload } from "@payloadcms/next/withPayload";
import { withSentryConfig } from "@sentry/nextjs/config";
import { securityHeaders, sentryIngestOrigin } from "@brandbasket/shared/lib/security-headers";
import { deploymentIdOf } from "./lib/deployment-id";
import { previewOrigins } from "./lib/preview-origins";


/** Fails a production deploy early instead of shipping dashboards that can't route or sign anyone in. */
function assertProductionEnvironment(): void {
  if (process.env.VERCEL_ENV !== "production") return;

  const missing = vercelProductionRequirements().filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Production deployment is missing required environment variables: ${missing.join(", ")}. See .env.example.`,
    );
  }
}

assertProductionEnvironment();

/** Every Vercel deployment is served over https; elsewhere the configured app origin says so. */
const servedOverHttps =
  process.env.VERCEL === "1" || (process.env.APP_ORIGIN?.trim().startsWith("https://") ?? false);

/**
 * The customer app (app.) and staff admin (admin.), with their API routes, including /api/leads for the website's
 * enquiries. The marketing website is its own repository.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Version skew protection: a page from an older release reloads itself instead of sending its Save to a build that
  // does not know the action (lib/deployment-id.ts).
  deploymentId: deploymentIdOf(process.cwd(), process.env.NEXT_DEPLOYMENT_ID),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          development: process.env.NODE_ENV === "development",
          https: servedOverHttps,
          // The live preview on the Listing and Your details pages frames the marketing website (components/panel/live-preview).
          framedOrigins: [...previewOrigins(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000")],
          // The billing pages open Razorpay Checkout (components/panel/razorpay-checkout-launcher.tsx).
          razorpayCheckout: true,
          // The browser's Sentry reports go to the DSN's own ingest host, and only when a DSN was set for this build.
          errorReportingOrigin: sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN),
        }),
      },
      // The site tracking script (public/t/v1.js): customers' pages load it from here, so it may be cached for an hour and
      // served stale for a day while a fresh copy is fetched. A new version gets a new file name (v2.js).
      { source: "/t/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
    ];
  },
  async redirects() {
    return [
      // The Add-ons page is now Services. A charge paid before the rename can still return to the old address with ?charge=,
      // which a redirect passes through. Redirects run before the proxy, so this holds on the dashboard host.
      { source: "/add-ons", destination: "/services", permanent: true },
    ];
  },
  // Server actions keep Next's default 1 MB body limit. Raising it for uploads would let anyone make every action
  // request hold more memory, so uploads go to the /api/uploads route handler instead, which counts the bytes itself
  // and stops at 4 MB. The proxy skips /api/, so that body is never copied for it.
  experimental: {
    // Next copies the body of every request the proxy matches, up to this many bytes, before the route runs. Nothing
    // the proxy matches needs more than an action's 1 MB, so this keeps any one request from pinning more (the
    // default is 10 MB). Past the limit Next logs a warning and forwards a truncated body rather than failing; no
    // legitimate request the proxy matches is that large. Checked against node_modules/next/dist/docs (16.3.5).
    proxyClientMaxBodySize: "1mb",
    // Still experimental in 16.3.5 (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md).
    // Needed since Task 1's Payload migration split this app into multiple root layouts (app-host, admin-host,
    // (payload)) — see app/global-not-found.tsx for why plain app/not-found.tsx can no longer reliably wrap a
    // truly unmatched top-level path with the right <html>/<body>.
    globalNotFound: true,
  },

  // Workspace packages ship TypeScript source.
  transpilePackages: ["@brandbasket/auth", "@brandbasket/billing", "@brandbasket/db", "@brandbasket/email", "@brandbasket/shared"],
};

// Wires Payload's own webpack/Turbopack config (its admin UI, CSS, import maps) into Next's build. See
// payload.config.ts and docs/superpowers/plans/2026-09-17-payload-cms-migration.md.
// Uploads source maps on production builds when SENTRY_AUTH_TOKEN is set, so stack traces show original code.
export default withSentryConfig(withPayload(nextConfig), {
  org: "fynix-digital",
  project: "brandbasket-platform",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
});
