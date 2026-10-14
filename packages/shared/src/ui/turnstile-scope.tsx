import { connection } from "next/server";
import type { ReactElement, ReactNode } from "react";
import { turnstileSiteKey } from "../server/turnstile-request";
import { TurnstileProvider } from "./turnstile";

/**
 * Wrap a page's forms in this so their <TurnstileWidget>s know the site key. It reads the key as the page is requested
 * (`connection()` stops the key being frozen into the page at build time, when the real keys are not present).
 */
export async function TurnstileScope({ children }: { readonly children: ReactNode }): Promise<ReactElement> {
  await connection();
  return <TurnstileProvider siteKey={turnstileSiteKey()}>{children}</TurnstileProvider>;
}
