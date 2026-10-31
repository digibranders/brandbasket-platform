import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, framedSiteOrigins, securityHeaders, sentryIngestOrigin } from "./security-headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const [name = "", ...values] = part.split(/\s+/);
        return [name, values] as const;
      }),
  );
}

const PRODUCTION = {
  development: false,
  https: true,
  framedOrigins: ["https://currycook.com"],
  razorpayCheckout: false,
} as const;

describe("contentSecurityPolicy", () => {
  it("allows the page's own resources and nothing else by default", () => {
    const policy = directives(contentSecurityPolicy(PRODUCTION));
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
  });

  it("lets the Turnstile robot check load, frame its challenge and report back", () => {
    const policy = directives(contentSecurityPolicy(PRODUCTION));
    expect(policy.get("script-src")).toContain("https://challenges.cloudflare.com");
    expect(policy.get("frame-src")).toContain("https://challenges.cloudflare.com");
    expect(policy.get("connect-src")).toContain("https://challenges.cloudflare.com");
  });

  it("lets Cloudflare Web Analytics load its beacon and send page views", () => {
    const policy = directives(contentSecurityPolicy(PRODUCTION));
    expect(policy.get("script-src")).toContain("https://static.cloudflareinsights.com");
    expect(policy.get("connect-src")).toContain("https://cloudflareinsights.com");
  });

  it("refuses to be framed by any site", () => {
    expect(directives(contentSecurityPolicy(PRODUCTION)).get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("lets the Calendly booking widget load and frame its calendar", () => {
    const policy = directives(contentSecurityPolicy(PRODUCTION));
    expect(policy.get("script-src")).toContain("https://assets.calendly.com");
    expect(policy.get("frame-src")).toContain("https://calendly.com");
    expect(policy.get("img-src")).toContain("https://i.ytimg.com");
  });

  it("plays video from the page's own origin, and from a chosen file in the browser, but from no other site", () => {
    // The owner's video page reads a chosen file's length from a blob: address before anything is sent.
    expect(directives(contentSecurityPolicy(PRODUCTION)).get("media-src")).toEqual(["'self'", "blob:"]);
  });

  it("lets a member's Vimeo videos play in Vimeo's player, show their posters, and be uploaded from the browser, and nothing more of Vimeo", () => {
    const policy = directives(contentSecurityPolicy(PRODUCTION));
    expect(policy.get("frame-src")).toContain("https://player.vimeo.com");
    expect(policy.get("img-src")).toContain("https://i.vimeocdn.com");
    expect(policy.get("connect-src")).toContain("https://*.upload.vimeo.com");
    // Not the whole of Vimeo, and not its script or style hosts.
    expect(policy.get("script-src")).not.toContain("https://player.vimeo.com");
    expect(policy.get("connect-src")).not.toContain("https://*.vimeo.com");
    expect(policy.get("frame-src")).not.toContain("https://*.vimeo.com");
  });

  it("frames only the client sites it is given, besides the players and the robot check it needs", () => {
    const frames = directives(contentSecurityPolicy(PRODUCTION)).get("frame-src");
    // Calendly's calendar, Turnstile's challenge, Vimeo's player for members' videos, then the client sites it was given.
    expect(frames).toEqual(["https://calendly.com", "https://challenges.cloudflare.com", "https://player.vimeo.com", "https://currycook.com"]);
  });

  it("allows eval only in development, where React needs it", () => {
    expect(directives(contentSecurityPolicy(PRODUCTION)).get("script-src")).not.toContain("'unsafe-eval'");
    expect(
      directives(contentSecurityPolicy({ ...PRODUCTION, development: true, https: false })).get("script-src"),
    ).toContain("'unsafe-eval'");
  });

  it("upgrades insecure requests only when the site is served over https", () => {
    expect(directives(contentSecurityPolicy(PRODUCTION)).has("upgrade-insecure-requests")).toBe(true);
    expect(directives(contentSecurityPolicy({ ...PRODUCTION, https: false })).has("upgrade-insecure-requests")).toBe(
      false,
    );
  });

  it("lets Razorpay Checkout load, frame its payment window and report, when asked to", () => {
    const policy = directives(contentSecurityPolicy({ ...PRODUCTION, razorpayCheckout: true }));
    expect(policy.get("script-src")).toEqual(expect.arrayContaining(["https://checkout.razorpay.com", "https://cdn.razorpay.com"]));
    expect(policy.get("frame-src")).toContain("https://api.razorpay.com");
    expect(policy.get("connect-src")).toContain("https://lumberjack.razorpay.com");
    // Its return to the callback is a top-level navigation, so posting forms to other sites stays refused.
    expect(policy.get("form-action")).toEqual(["'self'"]);
  });

  it("allows no Razorpay origin unless asked to", () => {
    expect(contentSecurityPolicy(PRODUCTION)).not.toContain("razorpay");
  });

  it("refuses a framed origin that isn't a bare https origin, or a bare http one on localhost", () => {
    for (const origin of ["http://example.com", "https://example.com/path", "https://example.com; script-src *", "http://localhost.evil.com"]) {
      expect(() => contentSecurityPolicy({ ...PRODUCTION, framedOrigins: [origin] })).toThrow(RangeError);
    }
  });

  it("frames a site on localhost over http, for a developer's machine", () => {
    for (const origin of ["http://localhost:3190", "http://app.localhost:3001"]) {
      expect(contentSecurityPolicy({ ...PRODUCTION, framedOrigins: [origin] })).toContain(origin);
    }
  });
});

describe("framedSiteOrigins", () => {
  it("keeps the origin of every site that may be framed, once each, and skips the rest", () => {
    expect(
      framedSiteOrigins([
        { liveUrl: "https://currycook.com/", embeddable: true },
        { liveUrl: "https://payweek.com/home", embeddable: true },
        { liveUrl: "https://currycook.com/menu", embeddable: true },
        { liveUrl: "https://www.gkrhospitality.com/", embeddable: false },
      ]),
    ).toEqual(["https://currycook.com", "https://payweek.com"]);
  });
});

describe("securityHeaders", () => {
  const byName = (options: Parameters<typeof securityHeaders>[0]): Map<string, string> =>
    new Map(securityHeaders(options).map((header) => [header.key, header.value]));

  it("sends the standard protections", () => {
    const headers = byName(PRODUCTION);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin-allow-popups");
    expect(headers.get("Content-Security-Policy")).toBe(contentSecurityPolicy(PRODUCTION));
  });

  it("asks browsers to insist on https only when the site is served over https", () => {
    expect(byName(PRODUCTION).get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(byName({ ...PRODUCTION, https: false }).has("Strict-Transport-Security")).toBe(false);
  });
});

describe("sentryIngestOrigin", () => {
  it("returns the ingest origin of a Sentry cloud DSN, without its key or project path", () => {
    expect(sentryIngestOrigin("https://abc123def456@o4511098086227968.ingest.us.sentry.io/4512226364948480")).toBe("https://o4511098086227968.ingest.us.sentry.io");
    expect(sentryIngestOrigin("  https://k@o1.ingest.sentry.io/2  ")).toBe("https://o1.ingest.sentry.io");
  });

  it("returns nothing for an unset, malformed, insecure or non-Sentry address", () => {
    expect(sentryIngestOrigin(undefined)).toBeUndefined();
    expect(sentryIngestOrigin("")).toBeUndefined();
    expect(sentryIngestOrigin("not a url")).toBeUndefined();
    expect(sentryIngestOrigin("http://k@o1.ingest.us.sentry.io/2")).toBeUndefined();
    expect(sentryIngestOrigin("https://k@evil.example/2")).toBeUndefined();
    expect(sentryIngestOrigin("https://k@o1.ingest.us.sentry.io.evil.example/2")).toBeUndefined();
    expect(sentryIngestOrigin("https://k@sentry.io/2")).toBeUndefined();
  });
});

describe("error reporting in the policy", () => {
  const connect = (errorReportingOrigin?: string): string[] =>
    directives(contentSecurityPolicy({ ...PRODUCTION, errorReportingOrigin })).get("connect-src") ?? [];

  it("lets the browser report errors to the one origin it was given", () => {
    expect(connect("https://o1.ingest.us.sentry.io")).toContain("https://o1.ingest.us.sentry.io");
  });

  it("adds nothing but the robot check, Web Analytics and Vimeo's upload host when there is no error reporting origin", () => {
    expect(connect()).toEqual([
      "'self'",
      "https://calendly.com",
      "https://*.calendly.com",
      "https://challenges.cloudflare.com",
      "https://cloudflareinsights.com",
      "https://*.upload.vimeo.com",
    ]);
  });
});

describe("Tag Manager in the policy", () => {
  const withTags = directives(contentSecurityPolicy({ ...PRODUCTION, tagManager: true }));

  it("lets Tag Manager, Google Analytics and Clarity load and report when the dashboard has a container", () => {
    expect(withTags.get("script-src")).toEqual(expect.arrayContaining(["https://www.googletagmanager.com", "https://*.clarity.ms"]));
    expect(withTags.get("connect-src")).toEqual(expect.arrayContaining(["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.clarity.ms"]));
    expect(withTags.get("img-src")).toEqual(expect.arrayContaining(["https://*.google-analytics.com", "https://c.bing.com"]));
    expect(withTags.get("frame-src")).toContain("https://www.googletagmanager.com");
  });

  it("opens none of those origins without a container, as on the staff console", () => {
    const closed = contentSecurityPolicy(PRODUCTION);
    for (const origin of ["googletagmanager.com", "google-analytics.com", "clarity.ms", "c.bing.com"]) expect(closed).not.toContain(origin);
  });

  it("keeps every other source as it was", () => {
    expect(withTags.get("default-src")).toEqual(["'self'"]);
    expect(withTags.get("frame-ancestors")).toEqual(["'none'"]);
    expect(withTags.get("script-src")).toContain("https://challenges.cloudflare.com");
  });
});
