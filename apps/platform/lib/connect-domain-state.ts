import type { DnsStatus } from "@fynix/shared/lib/onboarding/domain-dns";

/** What "Check my domain" last found, for the card to show. `records` is one status per record asked for, by its host. */
export type ConnectDomainState =
  | { readonly status: "idle" }
  | { readonly status: "checked"; readonly overall: DnsStatus; readonly records: readonly { readonly host: string; readonly status: DnsStatus }[] }
  | { readonly status: "error"; readonly message: string };

export const initialConnectDomainState: ConnectDomainState = { status: "idle" };

export const CHECK_FAILED_MESSAGE = "We couldn’t look that up just now. Try again in a minute.";
