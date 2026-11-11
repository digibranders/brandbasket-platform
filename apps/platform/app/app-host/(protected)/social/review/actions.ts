"use server";

import { listBoughtSetupServices, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { revalidatePath } from "next/cache";
import { notFound, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { requireBillingAccess } from "@/lib/server/billing";
import { getAppDb } from "@/lib/server/db";
import { actorOf, addNetwork, decideBatch, decidePoster, drawBatch, loadTopics, SocialAutoError, socialAutoSettings, type SocialAutoSettings } from "@/lib/server/social-auto";
import { socialAiEnabled } from "@/lib/server/social-ai-flag";
import { socialBrand, type SocialBrand } from "@/lib/server/social-brand";
import { wordsForCode } from "@/lib/social/ai";
import { CHANNEL_PLATFORMS, PLATFORM_NAMES } from "@/lib/social/auto";
import type { NewPostState } from "@/lib/social/new-post";

/**
 * The customer's choices on the review page: the written posts and the pictures. The business and the person come from
 * the session, never from the form. Every action answers a state the page shows, in the customer's own words, and the page asks
 * social-auto again afterwards (revalidatePath), so what is shown is always what social-auto holds.
 */

const REVIEW_PATH = "/social/review";
const ID = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);

type Guard = { readonly ok: true; readonly tenant: TenantContext; /** The brand being looked at: the workspace every call is made for. */ readonly brand: SocialBrand; readonly settings: SocialAutoSettings; readonly actor: string } | { readonly ok: false; readonly state: NewPostState };

/** The signed-in customer with the social service and the AI side on, and social-auto's settings, or the state to show. */
async function guard(): Promise<Guard> {
  const { tenant } = await requireBillingAccess();
  const bought = await withTenantScope(getAppDb(), tenant, (tx) => listBoughtSetupServices(tx, tenant.businessId));
  if (!bought.includes("social") || !socialAiEnabled()) notFound();
  const settings = socialAutoSettings();
  if (settings === null) return { ok: false, state: { status: "error", message: "Posting is not available just now. Try again later." } };
  return { ok: true, tenant, brand: await socialBrand(tenant), settings, actor: actorOf(tenant) };
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
    if (error instanceof SocialAutoError && error.code !== null) return { status: "error", message: wordsForCode(error.code) };
    console.error(`[social] could not ${what}`, errorLogInfo(error));
    return { status: "error", message: wordsForCode(null) };
  }
  revalidatePath(REVIEW_PATH);
  revalidatePath("/social");
  // A sentence to show the customer beside a choice that went through but has something to say.
  return typeof notice === "string" ? { status: "partial", message: notice } : { status: "saved" };
}

const badForm = (): NewPostState => ({ status: "error", message: "That could not be read. Reload the page and try again." });

/** Keep, drop or change the words of one written post. A change to one network's words names the network. */
export async function decideBatchAction(formData: FormData): Promise<NewPostState> {
  const shared = { batchId: ID, postId: ID };
  const parsed = z
    .discriminatedUnion("action", [
      z.object({ ...shared, action: z.enum(["keep", "drop"]) }),
      z.object({ ...shared, action: z.literal("edit"), network: z.enum(CHANNEL_PLATFORMS).optional(), caption: z.string().trim().min(1, "Write what the post should say.").max(2200), headline: z.string().trim().min(1).max(120).optional() }),
    ])
    .safeParse({ batchId: formData.get("batchId"), postId: formData.get("postId"), action: formData.get("action"), network: formData.get("network") ?? undefined, caption: formData.get("caption") ?? undefined, headline: formData.get("headline") ?? undefined });
  if (!parsed.success) return parsed.error.issues[0]?.message === "Write what the post should say." ? { status: "error", message: "Write what the post should say." } : badForm();
  const d = parsed.data;
  return run("change a written post", async ({ settings, brand, actor }) => {
    await decideBatch(settings, brand.externalId, d.batchId, d.action === "edit" ? { action: "edit", postId: d.postId, caption: d.caption, ...(d.network === undefined ? {} : { network: d.network }), ...(d.headline === undefined ? {} : { headline: d.headline }) } : { action: d.action, postId: d.postId }, actor);
  });
}

/** "Draw my pictures": asks for pictures for the posts the customer kept. This is what costs money, so social-auto limits it. */
export async function drawBatchAction(formData: FormData): Promise<NewPostState> {
  const parsed = z.object({ batchId: ID }).safeParse({ batchId: formData.get("batchId") });
  if (!parsed.success) return badForm();
  return run("draw the pictures", async ({ settings, brand, actor }) => void (await drawBatch(settings, brand.externalId, parsed.data.batchId, actor)));
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
