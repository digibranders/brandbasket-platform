"use server";

import { answerChannelLinkRequest, type ChannelLinkAnswer } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { logStaffAccessOrThrow } from "@/lib/server/staff-access-log";

const schema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  intent: z.enum(["invited", "refused", "connected"]),
  reason: z.string().trim().max(400).optional(),
});

/** Why the request could not be set up, in words the customer reads. Needed to refuse. */
const MIN_REASON = 3;

export type ChannelRequestNotice = "saved" | "invalid" | "reason" | "not-found";

function finish(notice: ChannelRequestNotice): never {
  revalidatePath("/clients/channel-requests");
  redirect(`/clients/channel-requests?notice=${notice}`);
}

/** The team's answer to a customer's profile link: invited (added as a tester), refused with a reason, or connected. */
export async function answerChannelRequestAction(formData: FormData): Promise<void> {
  const { user } = await requireStaffAccess();
  const parsed = schema.safeParse({ id: formData.get("id"), businessId: formData.get("businessId"), intent: formData.get("intent"), reason: formData.get("reason") ?? undefined });
  if (!parsed.success) finish("invalid");
  const { id, businessId, intent, reason } = parsed.data;
  let answer: ChannelLinkAnswer;
  if (intent === "refused") {
    if (reason === undefined || reason.length < MIN_REASON) finish("reason");
    answer = { state: "refused", reason };
  } else {
    answer = { state: intent };
  }
  const found = await answerChannelLinkRequest(getStaffDb(), { id, staffId: user.id, answer, now: new Date() });
  if (!found) finish("not-found");
  await logStaffAccessOrThrow({ staffUserId: user.id, action: `channel-request.${intent}`, targetType: "business", targetId: businessId, businessId });
  finish("saved");
}
