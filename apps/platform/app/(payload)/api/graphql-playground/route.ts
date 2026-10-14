/*
 * Based on the route file Payload's own installer generates for the GraphQL playground — see the [...slug]/route.ts
 * in ../[...slug] for why it was hand-adapted rather than generated in place, and require-admin-host.ts for why the
 * host check lives here rather than in proxy.ts.
 */
import config from "@/payload.config";
import "@payloadcms/next/css";
import { GRAPHQL_PLAYGROUND_GET } from "@payloadcms/next/routes";
import { requireAdminHost } from "@/lib/server/require-admin-host";

export const GET = requireAdminHost(GRAPHQL_PLAYGROUND_GET(config));
