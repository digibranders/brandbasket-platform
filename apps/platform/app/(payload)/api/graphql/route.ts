/*
 * Based on the route file Payload's own installer generates for GraphQL — see the [...slug]/route.ts in this same
 * directory for why it was hand-adapted rather than generated in place, and require-admin-host.ts for why the
 * host check lives here rather than in proxy.ts.
 */
import config from "@/payload.config";
import { GRAPHQL_POST, REST_OPTIONS } from "@payloadcms/next/routes";
import { requireAdminHost } from "@/lib/server/require-admin-host";

export const POST = requireAdminHost(GRAPHQL_POST(config));

// Payload's REST_OPTIONS is shared across its route handlers, so it keeps the `{ params }` second argument even
// though this route has no dynamic segment; Next still supplies it (empty) for every route handler.
export const OPTIONS = requireAdminHost(REST_OPTIONS(config));
