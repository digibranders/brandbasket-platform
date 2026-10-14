import type { ReactElement } from "react";
import { BrandedNotFound } from "@/components/panel/branded-not-found";

/**
 * Unmatched dashboard URLs render the dashboard's own 404 instead of the marketing one.
 *
 * Renders directly rather than calling next/navigation's `notFound()` (which would delegate to ../not-found.tsx):
 * verified live (curl against both `next dev` and a production `next build && next start`) that in this app's
 * multi-root-layout setup (see components/dashboard-root.tsx — Task 1's Payload migration split the old shared
 * app/layout.tsx into one root layout per surface), a `notFound()`-triggered boundary renders inside Next's
 * generic `<html id="__next_error__">` fallback shell instead of this segment's own root layout — no `lang`, no
 * font-variable classes, bare `<body>`. `app/global-not-found.tsx` (the documented fix for a *fully* unmatched
 * URL — see next.config.ts's `globalNotFound` flag) does not apply here: this URL isn't unmatched, this catch-all
 * page matches it. Rendering directly keeps the correct shell, at the cost of a 200 instead of a 404 status —
 * acceptable here since this dashboard is already fully deindexed (robots.ts, plus the noindex meta every
 * dashboard page inherits from app-host/layout.tsx's own metadata), so no SEO signal depends on the status code,
 * and getting the visible page right for a real person who mistyped a URL matters more than a status a crawler
 * will never see.
 */
export default function AppMissingPage(): ReactElement {
  return <BrandedNotFound />;
}
