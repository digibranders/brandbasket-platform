/**
 * Response headers sent on every page of all three hosts (marketing, app and admin), set in next.config.ts.
 *
 * The CSP has no nonces: they would force every page to render per request (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md, "Without Nonces"), so inline scripts
 * and styles stay allowed. What the policy does stop is loading scripts, frames and connections from anywhere else,
 * plugins, <base> rewrites, form posts to other sites, and being framed (clickjacking).
 */

export interface SecurityHeaderOptions {
  /** `next dev`: React needs eval for its error overlay. */
  readonly development: boolean;
  /** The deployment is served over https, so browsers may be told to insist on it. */
  readonly https: boolean;
  /** Origins of client sites shown live in a case study window. */
  readonly framedOrigins: readonly string[];
  /** The host opens Razorpay Checkout (the customer dashboard's payment pages). */
  readonly razorpayCheckout: boolean;
  /**
   * Where the browser's error reports go (Sentry), from `sentryIngestOrigin`. Left out when no DSN is set, because
   * the browser then sends nothing; without it here the browser would refuse the reports a DSN asks it to send.
   */
  readonly errorReportingOrigin?: string;
  /**
   * The customer dashboard loads its Google Tag Manager container (Google Analytics and Microsoft Clarity tags). Left
   * out on the staff console, which loads no tags.
   */
  readonly tagManager?: boolean;
}

export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

/**
 * Cloudflare Turnstile, the robot check on the sign-in, sign-up and enquiry forms (src/server/turnstile.ts): its script,
 * the challenge it frames, and the call it makes back to Cloudflare.
 */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Cloudflare Web Analytics: Cloudflare adds its beacon script to every page it serves, and the beacon reports each page
 * view back to Cloudflare. Without these the policy blocks it and no visits are counted.
 */
const WEB_ANALYTICS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";
const WEB_ANALYTICS_REPORT_ORIGIN = "https://cloudflareinsights.com";

/** The booking widget on Get started: its script, and the calendar it frames. */
const CALENDLY_SCRIPT_ORIGIN = "https://assets.calendly.com";
const CALENDLY_ORIGIN = "https://calendly.com";

/**
 * What Razorpay Checkout needs, measured by opening it on a test order under this policy and paying through to the
 * callback (2026-10-09): checkout.js and its risk-detection script, the payment window it frames, and its event
 * reporting. Razorpay publishes no list of its own. The return to the callback is a top-level navigation, so
 * form-action needs nothing.
 */
const RAZORPAY_SCRIPT_ORIGINS = ["https://checkout.razorpay.com", "https://cdn.razorpay.com"] as const;
const RAZORPAY_FRAME_ORIGIN = "https://api.razorpay.com";
const RAZORPAY_REPORTING_ORIGIN = "https://lumberjack.razorpay.com";

interface TagOrigins {
  readonly script: readonly string[];
  readonly style: readonly string[];
  readonly img: readonly string[];
  readonly font: readonly string[];
  readonly connect: readonly string[];
  readonly frame: readonly string[];
}

const NO_TAG_ORIGINS: TagOrigins = { script: [], style: [], img: [], font: [], connect: [], frame: [] };

/**
 * Google Tag Manager with its Google Analytics 4 and Microsoft Clarity tags, as the marketing website allows them (Google's
 * CSP guide, developers.google.com/tag-platform/security/guides/csp, with India's TLD; Microsoft's Clarity CSP guide). Tag
 * Manager's Preview mode origins are included so the container can be debugged. Custom JavaScript variables would need
 * 'unsafe-eval'; the container must not use them.
 */
const TAG_MANAGER_ORIGINS: TagOrigins = {
  script: ["https://www.googletagmanager.com", "https://tagmanager.google.com", "https://*.clarity.ms"],
  style: ["https://www.googletagmanager.com", "https://tagmanager.google.com", "https://fonts.googleapis.com"],
  img: [
    "https://www.googletagmanager.com",
    "https://ssl.gstatic.com",
    "https://www.gstatic.com",
    "https://*.google-analytics.com",
    "https://*.g.doubleclick.net",
    "https://www.google.com",
    "https://www.google.co.in",
    "https://*.clarity.ms",
    "https://c.bing.com",
  ],
  font: ["https://fonts.gstatic.com", "data:"],
  connect: [
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://*.g.doubleclick.net",
    "https://pagead2.googlesyndication.com",
    "https://www.google.com",
    "https://www.google.co.in",
    "https://*.clarity.ms",
    "https://c.bing.com",
  ],
  frame: ["https://www.googletagmanager.com"],
};

/** Two years, the value browsers' preload lists expect. */
const HSTS_MAX_AGE_SECONDS = 63_072_000;

/** Where YouTube serves video thumbnails (apps/platform/lib/youtube-video.ts builds them). */
const YOUTUBE_THUMBNAIL_ORIGIN = "https://i.ytimg.com";
/** A framed site is a bare https origin, or, on a developer's machine, a bare http origin on localhost. */
const BARE_FRAMED_ORIGIN = /^(?:https:\/\/[a-z0-9.-]+|http:\/\/(?:[a-z0-9-]+\.)?localhost)(?::\d+)?$/;

/** A Sentry cloud ingest host, such as o123.ingest.us.sentry.io: the only place a DSN may point the browser. */
const SENTRY_INGEST_HOST = /^[a-z0-9]+\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io$/;

/**
 * The origin a Sentry DSN reports to, or undefined when the DSN is unset, malformed, not https, or not a Sentry cloud
 * ingest address. Only that exact origin joins connect-src, so a mistyped or hostile value cannot widen the policy.
 */
export function sentryIngestOrigin(dsn: string | undefined): string | undefined {
  const value = dsn?.trim();
  if (value === undefined || value === "") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && SENTRY_INGEST_HOST.test(url.hostname) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Vimeo, which hosts a Premium member's short videos: its player (framed), its poster images, and its upload servers. */
const VIMEO_PLAYER_ORIGIN = "https://player.vimeo.com";
const VIMEO_IMAGE_ORIGIN = "https://i.vimeocdn.com";
const VIMEO_UPLOAD_ORIGIN = "https://*.upload.vimeo.com";

function assertFramedOrigin(origin: string): void {
  if (!BARE_FRAMED_ORIGIN.test(origin)) {
    throw new RangeError(`A framed site must be a bare https origin such as https://example.com (or http on localhost), received "${origin}"`);
  }
}

/** The origins of the case studies that are framed live, once each, in the order given. */
export function framedSiteOrigins(
  studies: readonly { readonly liveUrl: string; readonly embeddable: boolean }[],
): string[] {
  const origins = studies.filter((study) => study.embeddable).map((study) => new URL(study.liveUrl).origin);
  return [...new Set(origins)];
}

export function contentSecurityPolicy({ development, https, framedOrigins, razorpayCheckout, errorReportingOrigin, tagManager = false }: SecurityHeaderOptions): string {
  framedOrigins.forEach(assertFramedOrigin);
  const tags = tagManager ? TAG_MANAGER_ORIGINS : NO_TAG_ORIGINS;

  const directives: readonly (readonly string[])[] = [
    ["default-src", "'self'"],
    [
      "script-src",
      "'self'",
      "'unsafe-inline'",
      ...(development ? ["'unsafe-eval'"] : []),
      CALENDLY_SCRIPT_ORIGIN,
      TURNSTILE_ORIGIN,
      WEB_ANALYTICS_SCRIPT_ORIGIN,
      ...(razorpayCheckout ? RAZORPAY_SCRIPT_ORIGINS : []),
      ...tags.script,
    ],
    ["style-src", "'self'", "'unsafe-inline'", CALENDLY_SCRIPT_ORIGIN, ...tags.style],
    // i.ytimg.com: a free listing's featured video is a YouTube link, shown in the dashboard by its thumbnail.
    // i.vimeocdn.com: the poster of a Premium member's Vimeo video.
    ["img-src", "'self'", "data:", "blob:", YOUTUBE_THUMBNAIL_ORIGIN, VIMEO_IMAGE_ORIGIN, ...tags.img],
    // blob: lets the Photos tab read a chosen video's length in the browser before it is sent; videos are the page's own.
    ["media-src", "'self'", "blob:"],
    ["font-src", "'self'", ...tags.font],
    [
      "connect-src",
      "'self'",
      CALENDLY_ORIGIN,
      "https://*.calendly.com",
      TURNSTILE_ORIGIN,
      WEB_ANALYTICS_REPORT_ORIGIN,
      ...(razorpayCheckout ? [RAZORPAY_REPORTING_ORIGIN] : []),
      ...(errorReportingOrigin === undefined ? [] : [errorReportingOrigin]),
      // *.upload.vimeo.com: the browser sends a member's video straight to Vimeo's upload servers.
      VIMEO_UPLOAD_ORIGIN,
      ...tags.connect,
    ],
    ["frame-src", CALENDLY_ORIGIN, TURNSTILE_ORIGIN, VIMEO_PLAYER_ORIGIN, ...framedOrigins, ...(razorpayCheckout ? [RAZORPAY_FRAME_ORIGIN] : []), ...tags.frame],
    ["object-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
    ...(https ? [["upgrade-insecure-requests"]] : []),
  ];
  return directives.map((parts) => parts.join(" ")).join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions): SecurityHeader[] {
  return [
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
    // For browsers that predate frame-ancestors.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=(), interest-cohort=()",
    },
    // Keeps other windows from reaching into ours, while a payment provider's popup can still report back.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ...(options.https
      ? [{ key: "Strict-Transport-Security", value: `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains` }]
      : []),
  ];
}
