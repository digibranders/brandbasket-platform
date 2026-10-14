import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { readOriginsFromEnv, resolveSurface, type Surface } from "@/lib/surfaces";

const origins = readOriginsFromEnv(process.env);

/**
 * Backup for proxy.ts, which skips static-file paths. A dashboard layout calls this so its routes render a 404 unless
 * the request arrived on that dashboard's own host. It is not an access check: layouts do not re-run on every
 * navigation and never wrap server actions, so every page and action still verifies access itself.
 */
export async function requireSurfaceHost(surface: Surface): Promise<void> {
  const host = (await headers()).get("host");
  if (origins === null || resolveSurface(host, origins) !== surface) notFound();
}
