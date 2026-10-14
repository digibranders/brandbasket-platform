import { securityTxt } from "@firstfold/shared/lib/security-txt";
import { siteConfig } from "@firstfold/shared/lib/site-config";

/** Served on all three hosts: the proxy skips .txt paths, so every host reaches this handler directly. */
export function GET(): Response {
  return new Response(securityTxt({ email: siteConfig.email, now: new Date() }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
