import "server-only";
import { siteConfig } from "@fynix/shared/lib/site-config";

/**
 * The marketing website's own origin (NEXT_PUBLIC_SITE_URL): the one page-origin whose visitors' browsers may call the
 * owner routes (/api/directory-owner/*) with their dashboard session. Normalised to scheme, host and port, which is
 * exactly what a browser sends as `Origin`.
 */
export function websiteOrigin(): string {
  return new URL(siteConfig.url).origin;
}
