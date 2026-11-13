import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { deploymentIdOf } from "@brandbasket/shared/lib/deployment-id";
import { securityHeaders, sentryIngestOrigin } from "@brandbasket/shared/lib/security-headers";
import { GTM_ID } from "./src/features/consent/consent";
import { withPayload } from "@payloadcms/next/withPayload";

/** Every Vercel deployment is served over https; elsewhere the configured app origin says so. */
const servedOverHttps = process.env.VERCEL === "1" || (process.env.APP_ORIGIN?.trim().startsWith("https://") ?? false);

/** Where social-auto is, when this build is set up for it: the Social media page shows post pictures that it serves. A bad value is reported by the page itself. */
const socialAutoOrigin = ((): string | null => {
  try {
    const url = process.env.SOCIAL_AUTO_URL?.trim();
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Version skew protection: a page from an older release keeps talking to its own build. Off where there is no release id.
  deploymentId: deploymentIdOf(process.cwd(), process.env.NEXT_DEPLOYMENT_ID),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The customer app is a signed-in workspace: nothing on it may be indexed, on any host.
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          ...securityHeaders({
            development: process.env.NODE_ENV === "development",
            https: servedOverHttps,
            framedOrigins: [],
            // Checkout opens Razorpay's window (plan 61, phase 3).
            razorpayCheckout: true,
            // Tag Manager is allowed only when a container is configured (the consent banner starts it after a yes).
            tagManager: GTM_ID !== null,
            errorReportingOrigin: sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN),
            // The Social media page shows the pictures of posts, which social-auto serves.
            ...(socialAutoOrigin === null ? {} : { pictureOrigin: socialAutoOrigin }),
          }),
        ],
      },
      // The site tracking script (public/t/v1.js): customers' pages load it from here, so it may be cached for an hour and
      // served stale for a day while a fresh copy is fetched. A new version gets a new file name (v2.js). Same as apps/platform.
      { source: "/t/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }] },
    ];
  },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@brandbasket/auth", "@brandbasket/billing", "@brandbasket/cms", "@brandbasket/db", "@brandbasket/email", "@brandbasket/shared"],
};

// Uploads source maps on production builds when SENTRY_AUTH_TOKEN is set, so stack traces show original code.
export default withSentryConfig(withPayload(nextConfig), {
  org: "fynix-digital",
  project: "brandbasket-platform",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
});
