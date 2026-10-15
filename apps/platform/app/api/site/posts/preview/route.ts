import "server-only";
import { handleBlogPreviewRequest } from "@/lib/server/blog-preview-request";
import { blogPreviewSecret } from "@/lib/server/blog-preview-link";
import { findOnlineTenantBySiteToken, findPreviewPost } from "@/lib/server/site-api";

/**
 * `GET /api/site/posts/preview?token=…`: one draft post for a client site's preview page. All the rules live in
 * handleBlogPreviewRequest; this only supplies the real lookups. Under /api/, so proxy.ts's host routing skips it,
 * like /api/site/posts.
 */
export async function GET(request: Request): Promise<Response> {
  return handleBlogPreviewRequest(request, {
    secret: blogPreviewSecret(),
    now: () => new Date(),
    findTenantBySiteToken: findOnlineTenantBySiteToken,
    findPreviewPost,
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization",
    },
  });
}
