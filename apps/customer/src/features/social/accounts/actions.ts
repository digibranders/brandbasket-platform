"use server";

import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/action-result";
import { requireService } from "@/lib/guards";
import { brandOf } from "../brand";
import { reportError } from "@/lib/report";
import { VIEWER_MESSAGE } from "../rules";
import { PLATFORMS } from "../analytics/rules";
import { PostingServiceError } from "../posting-service";
import { deleteChannelLinkRequest, upsertChannelLinkRequest, withTenantScope } from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import { ensureWorkspace, fetchConnectLink, returnUrl } from "./client";
import { readProfileLink } from "./profile-link";
import { manualConnectModes } from "./request-store";
import { tellTeamAboutLink } from "./request-alert";
import { CONNECT_FAILED, CONNECT_UNAVAILABLE } from "./rules";

const connectSchema = z.object({ platform: z.enum(PLATFORMS) });

/**
 * Starts connecting one network: makes the business's workspace if it has none and asks the posting service for the link to the
 * network's own Allow page. The business and its name come from the session, never from the browser; only the network is read
 * from the caller. The caller opens the returned address. Only a business that bought Social media can start one.
 */
export async function startConnectAction(platform: string): Promise<ActionResult<{ readonly url: string }>> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const parsed = connectSchema.safeParse({ platform });
  if (!parsed.success) return actionFail(CONNECT_FAILED);
  try {
    const brand = await brandOf(customer);
    await ensureWorkspace({ id: brand.externalId, name: brand.name, ...(brand.externalId === customer.businessId ? {} : { group: customer.businessId }) });
    return actionOk({ url: await fetchConnectLink(brand.externalId, parsed.data.platform, returnUrl()) });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "social.connect" });
    return actionFail(error instanceof PostingServiceError && error.status === 0 ? CONNECT_UNAVAILABLE : CONNECT_FAILED);
  }
}

const requestSchema = z.object({ platform: z.enum(["instagram", "facebook"]), url: z.string().trim().min(1, "Paste the link to your profile.").max(500, "That link is too long.") });

const REQUEST_FAILED = "We could not send your link. Try again, and if it keeps happening, tell us.";
const REQUEST_ANSWERED = "Your request is already with our team. We will tell you here when it is your turn.";

/**
 * Sends the link to the customer's Instagram or Facebook profile, for the team to set up with her. The business, the brand and who sent
 * it come from the session; the network and the link come from the caller. A link that is not a profile is refused with what is wrong
 * with it. The team is told by email, once, and a failed email never fails the request.
 */
export async function requestChannelAction(platform: string, url: string): Promise<ActionResult<{ readonly handle: string }>> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const parsed = requestSchema.safeParse({ platform, url });
  if (!parsed.success) return actionFail(parsed.error.issues[0]?.message ?? REQUEST_FAILED);
  if (manualConnectModes()[parsed.data.platform] !== "request") return actionFail(REQUEST_FAILED);
  const link = readProfileLink(parsed.data.platform, parsed.data.url);
  if (!link.ok) return actionFail(link.message);
  try {
    const brand = await brandOf(customer);
    const saved = await withTenantScope(getAppDb(), customer.tenant, (tx) =>
      upsertChannelLinkRequest(tx, { businessId: customer.businessId, brandId: brand.externalId, network: parsed.data.platform, url: link.url, handle: link.handle, userId: customer.user.id }),
    );
    if (saved === null) return actionFail(REQUEST_ANSWERED);
    await tellTeamAboutLink({ id: saved.id, businessName: customer.businessName, network: parsed.data.platform, url: link.url, handle: link.handle, user: customer.user });
    return actionOk({ handle: link.handle });
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "social.channel-request" });
    return actionFail(REQUEST_FAILED);
  }
}

/** Takes the customer's request back, so she can send a different link. */
export async function cancelChannelRequestAction(platform: string): Promise<ActionResult> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return actionFail(VIEWER_MESSAGE);
  const parsed = requestSchema.shape.platform.safeParse(platform);
  if (!parsed.success) return actionFail(REQUEST_FAILED);
  try {
    const brand = await brandOf(customer);
    await withTenantScope(getAppDb(), customer.tenant, (tx) => deleteChannelLinkRequest(tx, customer.businessId, brand.externalId, parsed.data));
    return actionOk();
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { area: "social.channel-request-cancel" });
    return actionFail(REQUEST_FAILED);
  }
}
