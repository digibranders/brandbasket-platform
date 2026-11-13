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
import { ensureWorkspace, fetchConnectLink, returnUrl } from "./client";
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
