import type { CloudflareAccessResult } from "@/lib/server/cloudflare-access";
import type { PillTone } from "@/components/console/status-pill";

export interface ProtectionInput {
  /** REQUIRE_CF_ACCESS is "1": every console request must carry a verified Cloudflare Access assertion. */
  readonly required: boolean;
  readonly verified: CloudflareAccessResult;
}

export interface ProtectionLines {
  readonly tone: PillTone;
  readonly headline: string;
  readonly detail: string;
}

/** The words for the Staff page's protection status. It only reports what the proxy already decided; it changes nothing. */
export function protectionLines({ required, verified }: ProtectionInput): ProtectionLines {
  if (!required) {
    return {
      tone: "wait",
      headline: "Cloudflare Access is not required here",
      detail: "Only the staff sign-in protects this console. This is expected on a local machine and a problem on the live site.",
    };
  }
  if (!verified.ok) {
    return { tone: "problem", headline: "Cloudflare Access did not verify this request", detail: verified.reason };
  }
  return {
    tone: "done",
    headline: "Protected by Cloudflare Access",
    detail: verified.email === undefined ? "This request was verified." : `This request was verified for ${verified.email}.`,
  };
}
