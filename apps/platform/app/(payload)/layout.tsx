/*
 * Based on the layout file Payload's own installer generates — see the api routes in ./api and
 * docs/superpowers/plans/2026-09-17-payload-cms-migration.md Task 1 for why it was hand-adapted here rather than
 * generated in place (this repo's existing top-level app/layout.tsx made the installer refuse to run; that shared
 * layout has since been split into app-host/admin-host's own root layouts, freeing this route group to be a root
 * layout too — see components/dashboard-root.tsx for the app-host/admin-host side of that split).
 *
 * Two deviations from the raw generated file:
 * - `@/payload.config` instead of the installer's own `@payload-config` alias, matching this repo's existing `@/*`
 *   alias rather than adding a second one.
 * - `requireSurfaceHost("admin")`, the same backup check app-host/admin-host's own layouts already use in case
 *   proxy.ts's host gating (see proxy.ts and lib/surfaces.ts's isPayloadAdminPath) is ever bypassed or misconfigured.
 */
import config from "@/payload.config";
import "@payloadcms/next/css";
import type { ServerFunctionClient } from "payload";
import { handleServerFunctions, RootLayout } from "@payloadcms/next/layouts";
import type { ReactElement, ReactNode } from "react";
import { notFound } from "next/navigation";

import { importMap } from "./admin/importMap.js";
import "./custom.scss";

interface PayloadLayoutProps {
  readonly children: ReactNode;
}

const serverFunction: ServerFunctionClient = async function (args) {
  "use server";
  return handleServerFunctions({
    ...args,
    config,
    importMap,
  });
};

export default async function PayloadLayout({ children }: PayloadLayoutProps): Promise<ReactElement> {
  // Payload's own admin UI has no host to be served on: the staff console is apps/admin now, and nobody ever
  // authenticates to Payload itself. proxy.ts already refuses /admin; this refuses it again from inside, so the
  // UI cannot reappear on the customer host if that routing is ever changed. The API routes in this same group
  // are unaffected — they bypass the proxy and every collection denies access on its own.
  notFound();
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
