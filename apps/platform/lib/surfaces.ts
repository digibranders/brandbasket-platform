/**
 * What this app serves: the customer dashboard, and the API routes beside it.
 *
 * The staff console moved to apps/admin on 2026-09-21 and is its own deployable app on its own origin, so there
 * is only one surface here now. See docs/superpowers/plans/2026-09-21-admin-app-split.md.
 */
export type Surface = "app";

export interface SurfaceOrigins {
  readonly app: string;
  /**
   * An optional second host for the same dashboard, sold under another brand (LOCAL_BUSINESS_ORIGIN, Fynix Digital's
   * localbusiness host). It answers exactly what `app` answers; only the brand differs (see brandForHost).
   */
  readonly localBusiness?: string;
  /**
   * The brand every host is sold under unless it is the `localBusiness` one: Firstfold when unset. A deployment that
   * serves one brand only (Fynix's own server, PLATFORM_BRAND=fynix) sets it, so its app host needs no second name.
   */
  readonly defaultBrand?: BrandId;
  /**
   * Local development only: the dashboard also answers on any local address (`localhost`, `<anything>.localhost`,
   * `127.x.x.x`), whatever its port, so a link to /join or /login works from whichever one a developer has open.
   * Never on in production (see allowsAnyLocalHost), where only the app's own host is answered.
   */
  readonly anyLocalHost?: boolean;
}

/** Route folders under app/ that hold each dashboard. They are only reachable through their own host. */
export const SURFACE_PATH_PREFIX = {
  app: "/app-host",
} as const;

const HOST_PATTERN = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.?(?::(\d{1,5}))?$/;

/** Lowercases a Host header, drops a trailing dot and keeps the port. Anything else returns null. */
export function normaliseHost(rawHost: string): string | null {
  const match = HOST_PATTERN.exec(rawHost.trim().toLowerCase());
  const name = match?.[1];
  if (name === undefined) return null;
  const port = match?.[2];
  return port === undefined ? name : `${name}:${port}`;
}

function hostOfOrigin(origin: string): string | null {
  return normaliseHost(new URL(origin).host);
}

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

/**
 * A loopback name: `localhost`, anything under `.localhost`, or a 127.x.x.x address. `host` is a normalised host
 * (see normaliseHost), with or without its port. The bracketed IPv6 form, `[::1]`, is not a host normaliseHost
 * accepts, so it is never local here.
 */
export function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name.endsWith(".localhost") || LOOPBACK_IPV4.test(name);
}

/**
 * Whether the dashboard should answer on any local address: only under `next dev`. A production build
 * (`next build`, then `next start`) always runs with NODE_ENV=production, so a deployed dashboard never does,
 * whatever Host header a request claims.
 */
export function allowsAnyLocalHost(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV === "development";
}

export function resolveSurface(rawHost: string | null, origins: SurfaceOrigins): Surface | null {
  if (rawHost === null) return null;
  const host = normaliseHost(rawHost);
  if (host === null) return null;
  if (host === hostOfOrigin(origins.app)) return "app";
  if (origins.localBusiness !== undefined && host === hostOfOrigin(origins.localBusiness)) return "app";
  if (origins.anyLocalHost === true && isLocalHost(host)) return "app";
  // Customer websites are not served by this app (they are separate static projects), so any other host,
  // including the marketing website's, is not ours to answer.
  return null;
}

/**
 * Whether a request's Origin header is the dashboard's own: the configured app origin, or, where any local address
 * is answered, the very local address the request arrived on (the page and its request share one origin). For the
 * API routes that check it themselves because the proxy skips them.
 */
export function isAppOrigin(origin: string | null, rawHost: string | null, origins: SurfaceOrigins): boolean {
  if (origin === null) return false;
  if (origin === origins.app || origin === origins.localBusiness) return true;
  if (origins.anyLocalHost !== true || rawHost === null) return false;
  let originHost: string | null;
  try {
    originHost = normaliseHost(new URL(origin).host);
  } catch {
    return false;
  }
  return originHost !== null && originHost === normaliseHost(rawHost) && isLocalHost(originHost);
}

/** Which brand a dashboard host is sold under. */
export type BrandId = "firstfold" | "fynix";

/** Under `next dev`, any `localbusiness.<anything>.localhost` address is the Fynix one, so no extra setting is needed. */
const LOCAL_BUSINESS_DEV_PREFIX = "localbusiness.";

/**
 * The brand a request's host is sold under: Fynix on the configured LOCAL_BUSINESS_ORIGIN host (and, under `next dev`,
 * on any local `localbusiness.*` address), and everywhere else the deployment's default brand (PLATFORM_BRAND), which is
 * Firstfold unless set, so a host this does not know changes nothing.
 */
export function brandForHost(rawHost: string | null, origins: SurfaceOrigins | null): BrandId {
  if (origins === null) return "firstfold";
  if (rawHost === null) return origins.defaultBrand ?? "firstfold";
  const host = normaliseHost(rawHost);
  if (host === null) return origins.defaultBrand ?? "firstfold";
  if (origins.localBusiness !== undefined && host === hostOfOrigin(origins.localBusiness)) return "fynix";
  if (origins.anyLocalHost === true && isLocalHost(host) && host.startsWith(LOCAL_BUSINESS_DEV_PREFIX)) return "fynix";
  return origins.defaultBrand ?? "firstfold";
}

/**
 * The dashboard origin a request should send its user back to: the one they are on, so a link made for a Fynix visitor
 * lands on the Fynix host (where their session cookie is) and never on the Firstfold one. Anything not known is the
 * app origin, as before. Under `next dev` a `localbusiness.*` address that is not the configured one is used as it is.
 */
export function appOriginForHost(rawHost: string | null, origins: SurfaceOrigins): string {
  if (rawHost === null) return origins.app;
  const host = normaliseHost(rawHost);
  if (host === null) return origins.app;
  if (origins.localBusiness !== undefined && host === hostOfOrigin(origins.localBusiness)) return origins.localBusiness;
  if (brandForHost(host, origins) === "fynix") return `http://${host}`;
  return origins.app;
}

/** The internal path to render for a dashboard request. */
export function rewritePathForSurface(surface: Surface, pathname: string): string {
  const prefix = SURFACE_PATH_PREFIX[surface];
  return pathname === "/" ? prefix : `${prefix}${pathname}`;
}

/**
 * Payload CMS's own admin UI is mounted at its
 * default `/admin`, outside both `SURFACE_PATH_PREFIX` route groups — Payload's docs and issue tracker document
 * real bugs from relocating its admin panel to a custom sub-path, so this app gates it by host here instead of
 * moving it under /admin-host. Payload's REST/GraphQL API is not covered by this: it lives under /api/, which
 * proxy.ts's matcher already skips entirely (see that file), so those routes check the Host header themselves
 * (see lib/server/require-admin-host.ts) the same way lib/server/upload-request.ts already does for /api/uploads.
 */
const PAYLOAD_ADMIN_PATH_PREFIX = "/admin";

/** True for `/admin` and any path under it — Payload's admin UI, staff-only, reachable on the admin host only. */
export function isPayloadAdminPath(pathname: string): boolean {
  return pathname === PAYLOAD_ADMIN_PATH_PREFIX || pathname.startsWith(`${PAYLOAD_ADMIN_PATH_PREFIX}/`);
}

const ORIGIN_VARIABLES = {
  app: "APP_ORIGIN",
} as const;

/** Optional: unset means the Fynix host is off and nothing about routing changes. */
export const LOCAL_BUSINESS_ORIGIN_VARIABLE = "LOCAL_BUSINESS_ORIGIN";

function parseOrigin(name: string, value: string): string {
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`${name} must be an absolute URL such as http://app.localhost:3001, received "${value}"`);
  }
}

/**
 * The Fynix dashboard's origin, or undefined when LOCAL_BUSINESS_ORIGIN is unset or blank. Throws when it is set but is
 * not an absolute URL, or is the app's own host (a host cannot be both brands).
 */
export function readLocalBusinessOrigin(env: Readonly<Record<string, string | undefined>>): string | undefined {
  const value = env[LOCAL_BUSINESS_ORIGIN_VARIABLE]?.trim() ?? "";
  if (value === "") return undefined;
  const origin = parseOrigin(LOCAL_BUSINESS_ORIGIN_VARIABLE, value);
  const app = env[ORIGIN_VARIABLES.app]?.trim() ?? "";
  if (app !== "" && hostOfOrigin(origin) === hostOfOrigin(parseOrigin(ORIGIN_VARIABLES.app, app))) {
    throw new Error(`${LOCAL_BUSINESS_ORIGIN_VARIABLE} must be a different host from ${ORIGIN_VARIABLES.app}, received "${value}"`);
  }
  return origin;
}

/** Optional: the brand a deployment that serves one brand only sells under. Unset is Firstfold, as before. */
export const PLATFORM_BRAND_VARIABLE = "PLATFORM_BRAND";

/** The brand PLATFORM_BRAND names, or undefined when it is unset or blank. Throws on any other value, so a typo cannot quietly leave a Fynix server wearing Firstfold's name. */
export function readDefaultBrand(env: Readonly<Record<string, string | undefined>>): BrandId | undefined {
  const value = env[PLATFORM_BRAND_VARIABLE]?.trim().toLowerCase() ?? "";
  if (value === "") return undefined;
  if (value === "firstfold" || value === "fynix") return value;
  throw new Error(`${PLATFORM_BRAND_VARIABLE} must be "firstfold" or "fynix", received "${value}"`);
}

/**
 * Null when routing is not configured (both variables absent), in which case every request 404s. Throws when only
 * one is set, when a value is not an absolute URL, or when both resolve to the same host. Under `next dev` the
 * dashboard also answers on any local address (see SurfaceOrigins.anyLocalHost).
 */
export function readOriginsFromEnv(env: Readonly<Record<string, string | undefined>>): SurfaceOrigins | null {
  const raw: Record<Surface, string> = {
    app: env[ORIGIN_VARIABLES.app]?.trim() ?? "",
  };

  const surfaces = Object.keys(ORIGIN_VARIABLES) as ReadonlyArray<Surface>;
  const missing = surfaces.filter((surface) => raw[surface] === "");
  if (missing.length === surfaces.length) return null;

  const localBusiness = readLocalBusinessOrigin(env);
  const defaultBrand = readDefaultBrand(env);
  const origins: SurfaceOrigins = {
    app: parseOrigin(ORIGIN_VARIABLES.app, raw.app),
    ...(localBusiness === undefined ? {} : { localBusiness }),
    ...(defaultBrand === undefined ? {} : { defaultBrand }),
    ...(allowsAnyLocalHost(env) ? { anyLocalHost: true } : {}),
  };

  return origins;
}
