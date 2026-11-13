/*
 * Which hosts and origins count as this app's own. Route handlers get no host filtering and no server-action origin check,
 * so the upload and error-report routes compare the Host and Origin headers with the configured APP_ORIGIN themselves.
 * Ported from apps/platform lib/surfaces.ts, cut to what those routes use (this app has one surface).
 */

export interface AppOrigins {
  readonly app: string;
  /**
   * Local development only: the app also answers on any local address (`localhost`, `<anything>.localhost`, `127.x.x.x`),
   * whatever its port. Never on in production, where only the app's own host is answered.
   */
  readonly anyLocalHost?: boolean;
}

const HOST_PATTERN = /^([a-z0-9-]+(?:\.[a-z0-9-]+)*)\.?(?::(\d{1,5}))?$/;
const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;

/** Lowercases a Host header, drops a trailing dot and keeps the port. Anything else returns null. */
export function normaliseHost(rawHost: string): string | null {
  const match = HOST_PATTERN.exec(rawHost.trim().toLowerCase());
  const name = match?.[1];
  if (name === undefined) return null;
  const port = match?.[2];
  return port === undefined ? name : `${name}:${port}`;
}

/** `localhost`, anything under `.localhost`, or a 127.x.x.x address, with or without a port. */
export function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name.endsWith(".localhost") || LOOPBACK_IPV4.test(name);
}

/** Whether to answer on any local address: only under `next dev`, never in a production build whatever Host a request claims. */
export function allowsAnyLocalHost(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.NODE_ENV === "development";
}

/** The Host is the app's own, or (local development only) any local address. */
export function isAppHost(rawHost: string | null, origins: AppOrigins): boolean {
  if (rawHost === null) return false;
  const host = normaliseHost(rawHost);
  if (host === null) return false;
  return host === normaliseHost(new URL(origins.app).host) || (origins.anyLocalHost === true && isLocalHost(host));
}

/** The Origin is the app's own, or (local development only) the very local address the request arrived on. */
export function isAppOrigin(origin: string | null, rawHost: string | null, origins: AppOrigins): boolean {
  if (origin === null) return false;
  if (origin === origins.app) return true;
  if (origins.anyLocalHost !== true || rawHost === null) return false;
  let originHost: string | null;
  try {
    originHost = normaliseHost(new URL(origin).host);
  } catch {
    return false;
  }
  return originHost !== null && originHost === normaliseHost(rawHost) && isLocalHost(originHost);
}

/**
 * The app origin a request should be answered for: the one it is on, so a report from a developer's local address is
 * compared with that address. Anything else is the configured origin.
 */
export function appOriginForHost(rawHost: string | null, origins: AppOrigins): string {
  if (rawHost === null) return origins.app;
  const host = normaliseHost(rawHost);
  if (host === null) return origins.app;
  if (host === normaliseHost(new URL(origins.app).host)) return origins.app;
  if (origins.anyLocalHost === true && isLocalHost(host)) return `http://${host}`;
  return origins.app;
}
