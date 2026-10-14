/*
 * Based on the route file Payload's own installer (create-payload-app) generates for an existing Next.js app's
 * REST API catch-all — see docs/superpowers/plans/2026-09-17-payload-cms-migration.md Task 1, Step 4 for why it
 * was hand-adapted here rather than generated in place (this repo's existing top-level app/layout.tsx makes the
 * installer refuse to run). One deviation from the raw generated file: every method is wrapped with
 * `requireAdminHost` so this staff-only API 404s on any host but the admin one — see require-admin-host.ts for
 * why that check lives here rather than in proxy.ts.
 */
import config from "@/payload.config";
import "@payloadcms/next/css";
import {
  REST_DELETE,
  REST_GET,
  REST_OPTIONS,
  REST_PATCH,
  REST_POST,
  REST_PUT,
} from "@payloadcms/next/routes";
import { requireAdminHost } from "@/lib/server/require-admin-host";

export const GET = requireAdminHost(REST_GET(config));
export const POST = requireAdminHost(REST_POST(config));
export const DELETE = requireAdminHost(REST_DELETE(config));
export const PATCH = requireAdminHost(REST_PATCH(config));
export const PUT = requireAdminHost(REST_PUT(config));
export const OPTIONS = requireAdminHost(REST_OPTIONS(config));
