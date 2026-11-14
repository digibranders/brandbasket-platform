"use server";

import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { reportError } from "@/lib/report";
import { localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { requireService } from "@/lib/guards";
import { brandOf } from "@/features/social/brand";
import { BRAND_TIME_ZONE } from "@/legacy-social/shims";
import { actorOf, connectLink, createPost, deletePost, ensureWorkspace, loadChannels, loadSchedule, loadWorkspaceFacts, movePost, saveSchedule, sendPostNow, SocialAutoError, socialAutoSettings, startSiteJob, updatePost } from "@/legacy-social/server/social-auto";
import { canAddOn, checkNewPost, checkPostEdit, wordsForPostRefusal, isChangeablePostId, isTime, isWrittenPostId, momentHasPassed, type NewPostState } from "@/legacy-social/lib/social/new-post";
import { wordsForCode } from "@/legacy-social/lib/social/ai";
import { CHANNEL_PLATFORMS, PLATFORM_NAMES, type ChannelPlatform } from "@/legacy-social/lib/social/auto";
import { dayGroups, parseDays, withChannelDays } from "@/legacy-social/lib/social/schedule";

/*
 * The old Social media page's actions, copied as they were and moved onto this app's guards: the business and its name come from the
 * session, the person must be able to change things, and the service must be bought.
 */


/** The captions the customer wrote for single networks (`caption_linkedin` and so on). Only the networks whose box was open are sent. */
function variantsOf(formData: FormData): Record<string, string> {
  return Object.fromEntries(CHANNEL_PLATFORMS.flatMap((platform) => {
    const text = formData.get(`caption_${platform}`);
    return typeof text === "string" ? [[platform, text]] : [];
  }));
}

/** The state to show when social-auto refuses a change to a post with a sentence the customer can act on, or null for any other fault. */
function refusalState(error: unknown): NewPostState | null {
  if (!(error instanceof SocialAutoError)) return null;
  const message = wordsForPostRefusal(error.code, error.detail);
  return message === null ? null : { status: "error", message };
}

const connectSchema = z.object({ channel: z.enum(CHANNEL_PLATFORMS) });

/**
 * "Connect Instagram" (or Facebook, or LinkedIn): makes the business's workspace in social-auto if it has none, asks for a
 * link to the network's own Allow page and sends the customer there. The network sends them back to the Social page with the
 * result in the address. The business comes from the session, never from the form, and only a business that bought Social media
 * can start one.
 */
export async function connectChannelAction(formData: FormData): Promise<void> {
  const customer = await requireService("social", { write: true });
  const parsed = connectSchema.safeParse({ channel: formData.get("channel") });
  if (!parsed.success || customer.role === "viewer") redirect("/social?social=failed");
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
    const brand = await brandOf(customer);
    await ensureWorkspace(settings, { id: brand.externalId, name: brand.name, ...(brand.externalId === customer.businessId ? {} : { group: customer.businessId }) });
    link = await connectLink(settings, brand.externalId, parsed.data.channel);
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
const VIEWER_STATE: NewPostState = { status: "error", message: "Only owners and editors can change this." };

export async function createPostAction(formData: FormData): Promise<NewPostState> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return VIEWER_STATE;
  const unavailable: NewPostState = { status: "error", message: "Posting is not available just now. Try again later." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return unavailable;
    const connected = (await loadChannels(settings, (await brandOf(customer)).externalId)).map((channel) => channel.id);
    const checked = checkNewPost(
      { day: formData.get("day"), time: formData.get("time"), caption: formData.get("caption"), pictureId: formData.get("pictureId"), channels: formData.getAll("channel"), variants: variantsOf(formData) },
      localDateIn(BRAND_TIME_ZONE, new Date()),
      connected,
    );
    if (!checked.ok) return { status: "error", message: checked.message };
    await createPost(settings, (await brandOf(customer)).externalId, checked.post);
  } catch (error) {
    unstable_rethrow(error);
    const refused = refusalState(error);
    if (refused !== null) return refused;
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
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return VIEWER_STATE;
  const postId = formData.get("postId");
  const ownDay = formData.get("ownDay");
  const ownTime = formData.get("ownTime");
  if (!isChangeablePostId(postId) || typeof ownDay !== "string" || typeof ownTime !== "string") return { status: "error", message: "That post could not be found. Reload the page." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    const connected = (await loadChannels(settings, (await brandOf(customer)).externalId)).map((channel) => channel.id);
    const checked = checkPostEdit(
      { day: formData.get("day"), time: formData.get("time"), caption: formData.get("caption"), pictureId: formData.get("pictureId"), channels: formData.getAll("channel"), variants: variantsOf(formData) },
      localDateIn(BRAND_TIME_ZONE, new Date()),
      connected,
      { day: ownDay, time: ownTime },
    );
    if (!checked.ok) return { status: "error", message: checked.message };
    await updatePost(settings, (await brandOf(customer)).externalId, postId, checked.edit);
  } catch (error) {
    unstable_rethrow(error);
    const refused = refusalState(error);
    if (refused !== null) return refused;
    console.error("[social] could not change a post", errorLogInfo(error));
    return { status: "error", message: "The changes could not be saved. Try again." };
  }
  revalidatePath("/social");
  return { status: "saved" };
}

/** "Remove post": takes a post the business made off the calendar, while it has not gone out. */
export async function deletePostAction(formData: FormData): Promise<NewPostState> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return VIEWER_STATE;
  const postId = formData.get("postId");
  if (!isChangeablePostId(postId)) return { status: "error", message: "That post could not be found. Reload the page." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    await deletePost(settings, (await brandOf(customer)).externalId, postId);
  } catch (error) {
    unstable_rethrow(error);
    const refused = refusalState(error);
    if (refused !== null) return refused;
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
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return VIEWER_STATE;
  const postId = formData.get("postId");
  if (!isChangeablePostId(postId)) return { status: "error", message: "That post could not be found. Reload the page." };
  let result: Awaited<ReturnType<typeof sendPostNow>>;
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    result = await sendPostNow(settings, (await brandOf(customer)).externalId, postId);
  } catch (error) {
    unstable_rethrow(error);
    const refused = refusalState(error);
    if (refused !== null) return refused;
    console.error("[social] could not send a post now", errorLogInfo(error));
    return { status: "error", message: "The post could not be sent. Try again." };
  }
  revalidatePath("/social");
  if (!result.failed) return { status: "saved" };
  const names = result.accounts.length === 0 ? "one of the accounts" : result.accounts.join(" and ");
  return { status: "partial", message: `The post could not be sent to ${names}. We will try again at the next run.` };
}

/**
 * Moves a post to another day and time. `written` says whether it is one we wrote for the business (changed from its details window)
 * or one the business made (dragged on the calendar). The new moment must be ahead of now, which social-auto checks again.
 */
async function moveToMoment(formData: FormData, written: boolean): Promise<NewPostState> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return VIEWER_STATE;
  const postId = formData.get("postId");
  const day = formData.get("day");
  const time = formData.get("time");
  if (typeof postId !== "string" || !(written ? isWrittenPostId(postId) : isChangeablePostId(postId))) return { status: "error", message: "That post could not be found. Reload the page." };
  const today = localDateIn(BRAND_TIME_ZONE, new Date());
  if (typeof day !== "string" || !canAddOn(day, today)) return { status: "error", message: "Choose a day from today to 89 days ahead." };
  if (!isTime(time) || momentHasPassed(day, time, new Date())) return { status: "error", message: "That time has already passed. Choose a later time." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    await movePost(settings, (await brandOf(customer)).externalId, postId, { day, time });
  } catch (error) {
    unstable_rethrow(error);
    const refused = refusalState(error);
    if (refused !== null) return refused;
    console.error("[social] could not move a post", errorLogInfo(error));
    return { status: "error", message: "The post could not be moved. Try again." };
  }
  revalidatePath("/social");
  return { status: "saved" };
}

/** Drag and drop on the calendar: moves a post the business made, leaving its words, picture and accounts as they are. */
export async function movePostAction(formData: FormData): Promise<NewPostState> {
  return moveToMoment(formData, false);
}

/** "Change time" in the details window of a post we wrote: moves it to another day and time, leaving its words and picture as approved. */
export async function changeWrittenPostTimeAction(formData: FormData): Promise<NewPostState> {
  return moveToMoment(formData, true);
}

const siteSchema = z.object({ site: z.string().trim().min(1, "Write your website address.").max(300, "That address is too long."), page: z.boolean(), networks: z.array(z.enum(CHANNEL_PLATFORMS)).max(CHANNEL_PLATFORMS.length) });

/**
 * "Read my website" (or "Read this page"): starts a batch of written posts for the business. Nothing is drawn or paid for yet. The
 * business and the person come from the session; the form gives only the address, whether it is one page, and the networks. The
 * website is the business's own: social-auto keeps the first one it was given and refuses another. Answers a state the dialog shows.
 */
/**
 * Writes the customer's next month of posts: from the website the posting service already holds for this brand, for the networks that
 * are connected now, starting on the Monday the posting service named. Nothing is asked of the customer but the press of a button.
 */
export async function startNextMonthAction(formData: FormData): Promise<NewPostState> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return { status: "error", message: "Only owners and editors can change this." };
  const parsed = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse({ startDate: formData.get("startDate") });
  if (!parsed.success) return { status: "error", message: "That could not be read. Reload the page and try again." };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    const brand = await brandOf(customer);
    const [facts, channels] = await Promise.all([loadWorkspaceFacts(settings, brand.externalId), loadChannels(settings, brand.externalId)]);
    if (facts.website === null) return { status: "error", message: "Start from your website first, then the next month can follow." };
    const connected = [...new Set(channels.map((channel) => channel.platform))];
    if (connected.length === 0) return { status: "error", message: wordsForCode("INVALID_NETWORKS") };
    // Channels that post on different days are written one group at a time: the first now, the others when the customer starts them next.
    const [networks = connected, ...later] = dayGroups(connected, await loadSchedule(settings, brand.externalId));
    const started = await startSiteJob(settings, brand.externalId, { site: facts.website, page: false, networks, startDate: parsed.data.startDate }, actorOf(customer.tenant));
    if (!started.created) return { status: "error", message: STILL_WRITING };
    if (later.length > 0) return { status: "partial", message: laterGroupsMessage(networks, later.flat()) };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.code !== null) return { status: "error", message: wordsForCode(error.code) };
    reportError(error, { area: "social.start-next-month" });
    return { status: "error", message: wordsForCode(null) };
  }
  revalidatePath("/social");
  revalidatePath("/social/review");
  return { status: "saved" };
}

export async function startSiteJobAction(formData: FormData): Promise<NewPostState> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return { status: "error", message: "Only owners and editors can change this." };
  const parsed = siteSchema.safeParse({ site: formData.get("site"), page: formData.get("mode") === "page", networks: formData.getAll("network") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the address and try again." };
  if (parsed.data.networks.length === 0) return { status: "error", message: wordsForCode("INVALID_NETWORKS") };
  try {
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    const brand = await brandOf(customer);
    await ensureWorkspace(settings, { id: brand.externalId, name: brand.name, ...(brand.externalId === customer.businessId ? {} : { group: customer.businessId }) });
    const started = await startSiteJob(settings, brand.externalId, { site: parsed.data.site, page: parsed.data.page, networks: parsed.data.networks satisfies ChannelPlatform[] }, actorOf(customer.tenant));
    // A batch is already being written: the posting service hands back that one, not a new one for these channels.
    if (!started.created) return { status: "error", message: STILL_WRITING };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.code !== null) return { status: "error", message: wordsForCode(error.code) };
    reportError(error, { area: "social.start-site-job" });
    return { status: "error", message: wordsForCode(null) };
  }
  revalidatePath("/social");
  return { status: "saved" };
}

/** The posting service writes one batch at a time and hands back the one in progress, so a second start has to wait for it. */
const STILL_WRITING = "Your posts are still being written. When they are ready, you can start the next channel.";

/** What to tell a customer whose channels post on different days: one group is being written now, the rest are started next. */
function laterGroupsMessage(started: readonly ChannelPlatform[], later: readonly ChannelPlatform[]): string {
  const names = (list: readonly ChannelPlatform[]): string => list.map((platform) => PLATFORM_NAMES[platform]).join(" and ");
  return `Started for ${names(started)}. ${names(later)} posts on different days, so it is written separately: start it once these posts are written.`;
}

const postingDaysSchema = z.object({ channel: z.enum(CHANNEL_PLATFORMS), days: z.string().max(40) });

/**
 * Saves the days one channel posts on (`mon,tue,sat`; nothing at all takes the channel back to the usual spread). The posting service keeps
 * every channel's days as one setting, so the channels' other days are read first and sent with it. Only batches written afterwards use
 * the new days: what is already written never moves. The brand comes from the session, never from the form.
 */
export async function setPostingDaysAction(formData: FormData): Promise<NewPostState> {
  const parsed = postingDaysSchema.safeParse({ channel: formData.get("channel"), days: formData.get("days") ?? "" });
  const days = parsed.success ? parseDays(parsed.data.days) : null;
  if (!parsed.success || days === null) return { status: "error", message: "Choose the days from Monday to Sunday." };
  try {
    const customer = await requireService("social", { write: true });
    if (customer.role === "viewer") return { status: "error", message: "Only owners and editors can change this." };
    const settings = socialAutoSettings();
    if (settings === null) return { status: "error", message: "Posting is not available just now. Try again later." };
    const brand = await brandOf(customer);
    const current = await loadSchedule(settings, brand.externalId);
    if (current === null) return { status: "error", message: "Choosing days is not available just now. Try again later." };
    await saveSchedule(settings, brand.externalId, withChannelDays(current, parsed.data.channel, days));
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SocialAutoError && error.code !== null) return { status: "error", message: wordsForCode(error.code) };
    reportError(error, { area: "social.posting-days" });
    return { status: "error", message: wordsForCode(null) };
  }
  revalidatePath("/social");
  return { status: "saved" };
}
