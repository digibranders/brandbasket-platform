import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { deploymentIdOf } from "@brandbasket/shared/lib/deployment-id";
import { securityHeaders, sentryIngestOrigin } from "@brandbasket/shared/lib/security-headers";
import { GTM_ID } from "./src/features/consent/consent";

/** Every Vercel deployment is served over https; elsewhere the configured app origin says so. */
const servedOverHttps = process.env.VERCEL === "1" || (process.env.APP_ORIGIN?.trim().startsWith("https://") ?? false);

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
          }),
        ],
      },
    ];
  },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@brandbasket/auth", "@brandbasket/billing", "@brandbasket/db", "@brandbasket/email", "@brandbasket/shared"],
};

// Uploads source maps on production builds when SENTRY_AUTH_TOKEN is set, so stack traces show original code.
export default withSentryConfig(nextConfig, {
  org: "fynix-digital",
  project: "brandbasket-platform",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !process.env.CI,
});
