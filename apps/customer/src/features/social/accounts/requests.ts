import type { Platform } from "../analytics/rules";

/**
 * Instagram and Facebook cannot be connected with their Allow button until the network has approved our app, so the customer sends the
 * link to her profile and our team sets it up with her. Brandbasket keeps the request; the MANUAL_CONNECT setting says, per network,
 * whether it asks for a link (`request`) or shows the Allow button (`button`).
 */
export type ConnectMode = "request" | "button";

/** Where a request stands: waiting for the team, the team added her (she accepts and presses Allow), the team could not, or the account is connected. */
export type RequestState = "requested" | "invited" | "refused" | "connected";

export interface ChannelRequest {
  readonly network: Platform;
  /** The address of the profile, as the service cleaned it. */
  readonly url: string;
  /** The account name read from the link, for example `acme_foods`. */
  readonly handle: string;
  readonly state: RequestState;
  /** Why the team could not set it up, in words for the customer. Only with `refused`. */
  readonly reason: string | null;
}

/** The networks that ask for a link to the profile, from the MANUAL_CONNECT setting (a comma list, for example `instagram,facebook`). Anything else keeps its Allow button. */
export function connectModesOf(setting: string | undefined): Partial<Record<Platform, ConnectMode>> {
  const modes: Partial<Record<Platform, ConnectMode>> = {};
  for (const name of (setting ?? "").split(",")) {
    const network = name.trim().toLowerCase();
    if (network === "instagram" || network === "facebook") modes[network] = "request";
  }
  return modes;
}

const NAMES: Readonly<Record<Platform, string>> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", google: "Google" };

/** What the customer is told about a request: the line under the channel and the guide below it. */
export function requestWords(request: ChannelRequest): { readonly short: string; readonly long: string } {
  const name = NAMES[request.network];
  const who = request.handle === "" ? "your account" : request.network === "instagram" ? `@${request.handle}` : request.handle;
  switch (request.state) {
    case "requested":
      return { short: "Reviewing your profile", long: `We are reviewing ${who} so you can keep using ${name}. We will tell you here as soon as it is your turn.` };
    case "invited":
      return { short: "Accept the invite", long: `We added you. Accept the invite in ${name}, then press Allow ${name} here.` };
    case "refused":
      return { short: "Needs a change", long: request.reason ?? `We could not set up ${who}. Check the link and send it again.` };
    case "connected":
      return { short: "Connected", long: `${name} is connected.` };
  }
}
