"use server";

import { reportError } from "@/lib/report";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireService, type CustomerContext } from "@/lib/guards";
import { actorOf, addNetwork, decideBatch, decideCarousel, askTopic, decidePoster, drawBatch, loadTopics, moveTopic, replaceTopic, makeCarousel, setCarouselWeekly, SocialAutoError, socialAutoSettings, type SocialAutoSettings } from "@/legacy-social/server/social-auto";
import { brandOf, type SocialBrand } from "@/features/social/brand";
import { wordsForCode } from "@/legacy-social/lib/social/ai";
import { CHANNEL_PLATFORMS, PLATFORM_NAMES } from "@/legacy-social/lib/social/auto";
import type { NewPostState } from "@/legacy-social/lib/social/new-post";

/**
 * The customer's choices on the review page: the written posts and the pictures. The business and the person come from
 * the session, never from the form. Every action answers a state the page shows, in the customer's own words, and the page asks
 * social-auto again afterwards (revalidatePath), so what is shown is always what social-auto holds.
 */

const REVIEW_PATH = "/social/review";
const ID = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);

type Guard = { readonly ok: true; readonly tenant: CustomerContext["tenant"]; /** The brand being looked at: the workspace every call is made for. */ readonly brand: SocialBrand; readonly settings: SocialAutoSettings; readonly actor: string } | { readonly ok: false; readonly state: NewPostState };

/** The signed-in customer with the social service and the AI side on, and social-auto's settings, or the state to show. */
async function guard(): Promise<Guard> {
  const customer = await requireService("social", { write: true });
  if (customer.role === "viewer") return { ok: false, state: { status: "error", message: "Only owners and editors can change this." } };
  const settings = socialAutoSettings();
  if (settings === null) return { ok: false, state: { status: "error", message: "Posting is not available just now. Try again later." } };
  return { ok: true, tenant: customer.tenant, brand: await brandOf(customer), settings, actor: actorOf(customer.tenant) };
}

/** Runs one call to social-auto and turns what it answers into the page's state. */
async function run(what: string, work: (g: Extract<Guard, { ok: true }>) => Promise<string | void>): Promise<NewPostState> {
  const g = await guard();
  if (!g.ok) return g.state;
  let notice: string | void;
  try {
    notice = await work(g);
  } catch (error) {
    unstable_rethrow(error);
    // The posting service words this refusal itself (which channel, and the Monday it starts again), so that sentence is shown as it is.
    if (error instanceof SocialAutoError && (error.code === "PICTURE_LIMIT_REACHED" || error.code === "CAROUSEL_LIMIT_REACHED" || error.code === "TOPIC_LIMIT_REACHED" || error.code === "TEXT_REFUSED" || error.code === "LINK_NOT_ALLOWED") && error.detail !== null) return { status: "error", message: error.detail };
    if (error instanceof SocialAutoError && error.code !== null) return { status: "error", message: wordsForCode(error.code) };
    reportError(error, { area: `social.review.${what}` });
    return { status: "error", message: wordsForCode(null) };
  }
  revalidatePath(REVIEW_PATH);
  revalidatePath("/social");
  // A sentence to show the customer beside a choice that went through but has something to say.
  return typeof notice === "string" ? { status: "partial", message: notice } : { status: "saved" };
}

const badForm = (): NewPostState => ({ status: "error", message: "That could not be read. Reload the page and try again." });

/** Keep, drop, take a choice back to undecided (`reset`), or change the words of one written post. A change to one network's words names the network. */
export async function decideBatchAction(formData: FormData): Promise<NewPostState> {
  const shared = { batchId: ID, postId: ID };
  const parsed = z
    .discriminatedUnion("action", [
      z.object({ ...shared, action: z.enum(["keep", "drop", "reset"]) }),
      // The headline alone: it is printed on the picture, so it can only change before the picture is drawn.
      z.object({ ...shared, action: z.literal("edit-headline"), headline: z.string().trim().min(1, "Write a headline.").max(120, "Keep the headline under 120 characters.") }),
      z.object({ ...shared, action: z.literal("edit"), network: z.enum(CHANNEL_PLATFORMS).optional(), caption: z.string().trim().min(1, "Write what the post should say.").max(2200), headline: z.string().trim().min(1).max(120).optional() }),
    ])
    .safeParse({ batchId: formData.get("batchId"), postId: formData.get("postId"), action: formData.get("action"), network: formData.get("network") ?? undefined, caption: formData.get("caption") ?? undefined, headline: formData.get("headline") ?? undefined });
  if (!parsed.success) {
    const said = parsed.error.issues[0]?.message;
    return said === "Write what the post should say." || said === "Write a headline." || said === "Keep the headline under 120 characters." ? { status: "error", message: said } : badForm();
  }
  const d = parsed.data;
  if (d.action === "edit-headline") return run("change a headline", async ({ settings, brand, actor }) => void (await decideBatch(settings, brand.externalId, d.batchId, { action: "edit", postId: d.postId, headline: d.headline }, actor)));
  return run("change a written post", async ({ settings, brand, actor }) => {
    await decideBatch(settings, brand.externalId, d.batchId, d.action === "edit" ? { action: "edit", postId: d.postId, caption: d.caption, ...(d.network === undefined ? {} : { network: d.network }), ...(d.headline === undefined ? {} : { headline: d.headline }) } : { action: d.action, postId: d.postId }, actor);
  });
}

/** Moves a topic to another day of its week by dragging its card or picking a day. The week's other topics stay where they are. */
export async function moveTopicAction(formData: FormData): Promise<NewPostState> {
  const parsed = z.object({ batchId: ID, postId: ID, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse({ batchId: formData.get("batchId"), postId: formData.get("postId"), day: formData.get("day") });
  if (!parsed.success) return badForm();
  return run("move a topic", async ({ settings, brand, actor }) => {
    const moved = await moveTopic(settings, brand.externalId, parsed.data.batchId, parsed.data.postId, parsed.data.day, actor);
    // The words are not rewritten for the new day, so a topic that names one (Friday, tomorrow) is flagged for her to check.
    return moved.wordsNameADay ? "Moved. The words of this topic name a day, so read them again to see they still fit." : undefined;
  });
}

/** "Write your own": a post about something she wrote in her own words, for the week being looked at. One a week; nothing is drawn until she asks. */
export async function askTopicAction(formData: FormData): Promise<NewPostState> {
  const parsed = z
    .object({ text: z.string().trim().min(10, "Write a little more: what is it, and when or for how long.").max(1000, "Keep it under 1000 characters."), week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
    .safeParse({ text: formData.get("text"), week: formData.get("week") ?? undefined });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Write what the post is about." };
  return run("write her own topic", async ({ settings, brand, actor }) => void (await askTopic(settings, brand.externalId, parsed.data.text, parsed.data.week, actor)));
}

/** "New topic": asks for a new topic in place of a post the customer dropped. It is written in the background; the page shows it when it is ready. */
export async function replaceTopicAction(formData: FormData): Promise<NewPostState> {
  const parsed = z.object({ batchId: ID, postId: ID }).safeParse({ batchId: formData.get("batchId"), postId: formData.get("postId") });
  if (!parsed.success) return badForm();
  return run("write a new topic", async ({ settings, brand, actor }) => void (await replaceTopic(settings, brand.externalId, parsed.data.batchId, parsed.data.postId, actor)));
}

/** "Draw my pictures": asks for pictures for the posts the customer kept. This is what costs money, so social-auto limits it. */
export async function drawBatchAction(formData: FormData): Promise<NewPostState> {
  // `week` is the Monday of one week of a plan; a batch drawn in one piece has none.
  const parsed = z.object({ batchId: ID, week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), retry: z.literal("1").optional() }).safeParse({ batchId: formData.get("batchId"), week: formData.get("week") || undefined, retry: formData.get("retry") || undefined });
  if (!parsed.success) return badForm();
  return run("draw the pictures", async ({ settings, brand, actor }) => void (await drawBatch(settings, brand.externalId, parsed.data.batchId, actor, parsed.data.week, parsed.data.retry === "1")));
}

/** The customer's decision on a picture: approve it, send it back with a reason, take an approval back, ask for one more, or approve every network's picture of one topic. */
export async function decidePosterAction(formData: FormData): Promise<NewPostState> {
  const parsed = z
    .discriminatedUnion("action", [
      z.object({ action: z.enum(["approve", "withdraw", "redraw"]), id: ID }),
      z.object({ action: z.literal("reject"), id: ID, reason: z.string().trim().min(1).max(40), comment: z.string().trim().max(500).optional() }),
      z.object({ action: z.literal("approve-topic"), batchId: ID, postId: ID }),
      z.object({ action: z.literal("change-words"), id: ID, caption: z.string().trim().min(1).max(3000) }),
    ])
    .safeParse({ action: formData.get("action"), id: formData.get("id") ?? undefined, reason: formData.get("reason") ?? undefined, comment: formData.get("comment") || undefined, caption: formData.get("caption") ?? undefined, batchId: formData.get("batchId") ?? undefined, postId: formData.get("postId") ?? undefined });
  if (!parsed.success) return badForm();
  const d = parsed.data;
  return run("decide a picture", async ({ settings, brand, actor }) => {
    const decision = d.action === "reject" ? { action: "reject" as const, id: d.id, reason: d.reason, ...(d.comment === undefined ? {} : { comment: d.comment }) } : d.action === "approve-topic" ? { action: "approve-topic" as const, batchId: d.batchId, postId: d.postId } : d.action === "change-words" ? { action: "change-words" as const, id: d.id, caption: d.caption } : { action: d.action, id: d.id };
    const answer = await decidePoster(settings, brand.externalId, decision, actor);
    if (d.action === "approve" && answer.waitingForRelease) return "Approved. It goes out after the next update.";
    if (d.action === "change-words") return answer.postStopped ? "Saved. This post is held back until you approve its new words." : "Saved. Approve the new words and it goes out.";
    return undefined;
  });
}

/**
 * "Write for Facebook" (or another connected network): writes the posts the customer already has for one more network, from the same
 * topics, with no new website read. Every written post that lacks the network is asked for; the words arrive as a job the page follows,
 * and the customer approves only the new network's version. Nothing already approved changes.
 */
export async function addNetworkAction(formData: FormData): Promise<NewPostState> {
  const parsed = z.object({ network: z.enum(CHANNEL_PLATFORMS) }).safeParse({ network: formData.get("network") });
  if (!parsed.success) return badForm();
  const { network } = parsed.data;
  return run("write for a new network", async ({ settings, brand, actor }) => {
    const batchIds = [...new Set((await loadTopics(settings, brand.externalId)).filter((topic) => topic.missing.includes(network)).map((topic) => topic.batchId))];
    if (batchIds.length === 0) return `Your posts are already written for ${PLATFORM_NAMES[network]}.`;
    for (const batchId of batchIds) {
      try {
        await addNetwork(settings, brand.externalId, batchId, network, actor);
      } catch (error) {
        // A batch that already has it is what was asked for.
        if (!(error instanceof SocialAutoError && error.code === "NETWORK_ALREADY_THERE")) throw error;
      }
    }
    return `We are writing your posts for ${PLATFORM_NAMES[network]}. They will appear here for you to approve.`;
  });
}

/** Asks for this week's carousel. The posting service makes it for the connected accounts from the website it already read. */
export async function makeCarouselAction(_formData: FormData): Promise<NewPostState> {
  return run("make the carousel", async ({ settings, brand, actor }) => void (await makeCarousel(settings, brand.externalId, {}, actor)));
}

/** Switches the weekly carousel on or off. While on, the posting service makes one each week and waits for the customer's approval. */
export async function setWeeklyCarouselAction(formData: FormData): Promise<NewPostState> {
  const parsed = z.enum(["on", "off"]).safeParse(formData.get("enabled"));
  if (!parsed.success) return badForm();
  const enabled = parsed.data === "on";
  return run("switch the weekly carousel", async ({ settings, brand, actor }) => {
    await setCarouselWeekly(settings, brand.externalId, enabled, actor);
  });
}

/** The customer's decision on the whole carousel: approve it, or send it back with a reason. Never one slide. */
export async function decideCarouselAction(formData: FormData): Promise<NewPostState> {
  const parsed = z
    .discriminatedUnion("action", [
      z.object({ id: ID, action: z.literal("approve") }),
      z.object({ id: ID, action: z.literal("reject"), reason: z.string().trim().min(1).max(40), comment: z.string().trim().max(500).optional() }),
    ])
    .safeParse({ id: formData.get("id"), action: formData.get("action"), reason: formData.get("reason") ?? undefined, comment: formData.get("comment") || undefined });
  if (!parsed.success) return badForm();
  const d = parsed.data;
  return run("decide the carousel", async ({ settings, brand, actor }) => {
    await decideCarousel(settings, brand.externalId, d.action === "approve" ? { action: "approve", id: d.id } : { action: "reject", id: d.id, reason: d.reason, ...(d.comment === undefined ? {} : { comment: d.comment }) }, actor);
    if (d.action === "approve") return "Approved. It goes out on its day.";
  });
}
