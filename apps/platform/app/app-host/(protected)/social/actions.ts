"use server";

import { approveDeliverables, DeliverableError, listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { notFound, redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireBillingAccess } from "@/lib/server/billing";
import { getAppDb } from "@/lib/server/db";
import { connectLink, createPost, deletePost, ensureWorkspace, loadChannels, movePost, sendPostNow, SocialAutoError, socialAutoSettings, updatePost } from "@/lib/server/social-auto";
import { CHANNEL_PLATFORMS } from "@/lib/social/auto";
import { canAddOn, checkNewPost, checkPostEdit, isChangeablePostId, isTime, momentHasPassed, type NewPostState } from "@/lib/social/new-post";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";

const MAX_IDS = 50;
const idsSchema = z.array(z.uuid()).min(1).max(MAX_IDS);

/**
 * "Approve" on the posts the customer was shown. The business and the person come from the session, never from the form:
 * the form names only the posts, and the database function approves those that are posts of this business awaiting
 * approval. Fewer approved than shown means some changed since the page loaded, which the page says in plain words.
 */
export async function approvePostsAction(formData: FormData): Promise<void> {
  const { tenant } = await requireBillingAccess();
  const parsed = idsSchema.safeParse([...new Set(formData.getAll("ids"))]);
  if (!parsed.success) redirect("/social?notice=failed");
  const ids = parsed.data;
  let notice: "approved" | "changed" | "failed";
  try {
    const approved = await withTenantScope(getAppDb(), tenant, (tx) => approveDeliverables(tx, ids));
    notice = approved === ids.length ? "approved" : "changed";
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof DeliverableError && error.code === "not_found") notFound();
    console.error("[social] could not approve posts", errorLogInfo(error));
    notice = "failed";
  }
  revalidatePath("/social");
  revalidatePath("/");
  redirect(`/social?notice=${notice}`);
}

const connectSchema = z.object({ channel: z.enum(CHANNEL_PLATFORMS) });

/**
 * "Connect Instagram" (or Facebook, or LinkedIn): makes the business's workspace in social-auto if it has none, asks for a
 * link to the network's own Allow page and sends the customer there. The network sends them back to the Social page with the
 * result in the address. The business comes from the session, never from the form, and only a business that bought Social media
 * can start one.
 */
export async function connectChannelAction(formData: FormData): Promise<void> {
  const { tenant } = await requireBillingAccess();
  const parsed = connectSchema.safeParse({ channel: formData.get("channel") });
  if (!parsed.success) redirect("/social?social=failed");
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) notFound();
  const failed = `/social?social=failed&channel=${parsed.data.channel}`;
  let settings: ReturnType<typeof socialAutoSettings>;
  try {
    settings = socialAutoSettings();
  } catch (error) {
    // Set up wrongly on this server: the team is told in the log, the customer that it is not working.
    console.error("[social] social-auto is not configured correctly", errorLogInfo(error));
    redirect(failed);
  }
  if (settings === null) redirect("/social?social=unavailable");
  let link: string;
  try {
    await ensureWorkspace(settings, { id: tenant.businessId, name: tenant.businessName });
    link = await connectLink(settings, tenant.businessId, parsed.data.channel);
  } catch (error) {
    unstable_rethrow(error);
    console.error("[social] could not start a connection", errorLogInfo(error));
    redirect(failed);
  }
  redirect(link);
}

/**
 * "Schedule post" in the new-post window: a post for one day (it goes out at 10:00 that day), with its picture already stored
 * (POST /api/social-posts/picture) and the accounts the customer ticked. The business comes from the session; the accounts must be
 * ones connected for it, read from social-auto, not from the form. Answers a state the window shows, instead of redirecting.
 */
export async function createPostAction(formData: FormData): Promise<NewPostState> {
  const { tenant } = await requireBillingAccess();
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) notFound();
  const unavailable: NewPostState = { status: "error", message: "Posting is not available just now. Try again later." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return unavailable;
    const connected = (await loadChannels(settings, tenant.businessId)).map((channel) => channel.id);
    const checked = checkNewPost(
      { day: formData.get("day"), time: formData.get("time"), caption: formData.get("caption"), pictureId: formData.get("pictureId"), channels: formData.getAll("channel") },
      localDateIn(BRAND_TIME_ZONE, new Date()),
      connected,
    );
    if (!checked.ok) return { status: "error", message: checked.message };
    await createPost(settings, tenant.businessId, checked.post);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.detail !== null) return { status: "error", message: error.detail };
    console.error("[social] could not schedule a post", errorLogInfo(error));
    return { status: "error", message: "The post could not be saved. Try again." };
  }
  revalidatePath("/social");
  return { status: "saved" };
}

/**
 * "Save changes" on a post the business made: a new day, words, picture (optional, already stored) or accounts. The business comes
 * from the session; the post must be one of its own (social-auto answers "no such post" for anyone else's) and one that has not
 * gone out. The accounts must be ones connected for it, read from social-auto.
 */
export async function updatePostAction(formData: FormData): Promise<NewPostState> {
  const { tenant } = await requireBillingAccess();
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) notFound();
  const postId = formData.get("postId");
  const ownDay = formData.get("ownDay");
  const ownTime = formData.get("ownTime");
  if (!isChangeablePostId(postId) || typeof ownDay !== "string" || typeof ownTime !== "string") return { status: "error", message: "That post could not be found. Reload the page." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    const connected = (await loadChannels(settings, tenant.businessId)).map((channel) => channel.id);
    const checked = checkPostEdit(
      { day: formData.get("day"), time: formData.get("time"), caption: formData.get("caption"), pictureId: formData.get("pictureId"), channels: formData.getAll("channel") },
      localDateIn(BRAND_TIME_ZONE, new Date()),
      connected,
      { day: ownDay, time: ownTime },
    );
    if (!checked.ok) return { status: "error", message: checked.message };
    await updatePost(settings, tenant.businessId, postId, checked.edit);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.detail !== null) return { status: "error", message: error.detail };
    console.error("[social] could not change a post", errorLogInfo(error));
    return { status: "error", message: "The changes could not be saved. Try again." };
  }
  revalidatePath("/social");
  return { status: "saved" };
}

/** "Remove post": takes a post the business made off the calendar, while it has not gone out. */
export async function deletePostAction(formData: FormData): Promise<NewPostState> {
  const { tenant } = await requireBillingAccess();
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) notFound();
  const postId = formData.get("postId");
  if (!isChangeablePostId(postId)) return { status: "error", message: "That post could not be found. Reload the page." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    await deletePost(settings, tenant.businessId, postId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.detail !== null) return { status: "error", message: error.detail };
    console.error("[social] could not remove a post", errorLogInfo(error));
    return { status: "error", message: "The post could not be removed. Try again." };
  }
  revalidatePath("/social");
  return { status: "saved" };
}

/**
 * "Post now": sends a post the business made straight away instead of at the next 10:00 run. It sends the post as saved. When
 * some account refuses it, the post stays due and the next run tries again, which the message says.
 */
export async function sendPostNowAction(formData: FormData): Promise<NewPostState> {
  const { tenant } = await requireBillingAccess();
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) notFound();
  const postId = formData.get("postId");
  if (!isChangeablePostId(postId)) return { status: "error", message: "That post could not be found. Reload the page." };
  let result: Awaited<ReturnType<typeof sendPostNow>>;
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    result = await sendPostNow(settings, tenant.businessId, postId);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.detail !== null) return { status: "error", message: error.detail };
    console.error("[social] could not send a post now", errorLogInfo(error));
    return { status: "error", message: "The post could not be sent. Try again." };
  }
  revalidatePath("/social");
  if (!result.failed) return { status: "saved" };
  const names = result.accounts.length === 0 ? "one of the accounts" : result.accounts.join(" and ");
  return { status: "partial", message: `The post could not be sent to ${names}. We will try again at the next run.` };
}

/**
 * Drag and drop on the calendar: moves a post the business made to another day and time, leaving its words, picture and accounts as
 * they are. The new moment must be ahead of now, which social-auto checks again. Answers a state the calendar shows.
 */
export async function movePostAction(formData: FormData): Promise<NewPostState> {
  const { tenant } = await requireBillingAccess();
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social")) notFound();
  const postId = formData.get("postId");
  const day = formData.get("day");
  const time = formData.get("time");
  if (!isChangeablePostId(postId)) return { status: "error", message: "That post could not be found. Reload the page." };
  const today = localDateIn(BRAND_TIME_ZONE, new Date());
  if (typeof day !== "string" || !canAddOn(day, today)) return { status: "error", message: "Choose a day from today to 89 days ahead." };
  if (!isTime(time) || momentHasPassed(day, time, new Date())) return { status: "error", message: "That time has already passed. Choose a later time." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    await movePost(settings, tenant.businessId, postId, { day, time });
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.detail !== null) return { status: "error", message: error.detail };
    console.error("[social] could not move a post", errorLogInfo(error));
    return { status: "error", message: "The post could not be moved. Try again." };
  }
  revalidatePath("/social");
  return { status: "saved" };
}
