import { z } from "zod";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/**
 * What social-auto's AI side tells us (the website jobs, the facts it found, the written posts and the pictures to approve), and how
 * the Social media page reads it. Pure: no network and no server-only code, so the page's client parts and the tests can use it. The
 * shapes follow docs/product-api.md in social-auto; each reader keeps what reads as its shape and drops the rest, so one entry the
 * page does not understand never hides the others.
 */

const platformSchema = z.enum(CHANNEL_PLATFORMS);

export const jobSchema = z.object({
  id: z.string().min(1),
  /** `write` is a batch of written posts; `draw` is the pictures for the posts that were kept; `network` is the same posts written for one more network. */
  kind: z.enum(["write", "draw", "network", "carousel", "replace", "topic"]),
  state: z.enum(["queued", "running", "done", "failed"]),
  /** 1 to 4 while it runs: reading the website, writing, drawing, putting the results in review. */
  step: z.number().int().optional(),
  batchId: z.string().optional(),
  /** The channels a `write` job is writing for, when the posting service says (an older one does not). */
  networks: z.array(z.enum(["instagram", "facebook", "linkedin", "google"])).optional(),
  /** The dropped post a `replace` job writes a new topic for. */
  postId: z.string().optional(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
  /** Why a job failed, as the posting service's stable code (such as `PAGE_MODE_UNAVAILABLE`), when it says. */
  failure: z.string().optional(),
});
export type SiteJob = z.output<typeof jobSchema>;

const factSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  sourceUrl: z.string().optional(),
  sourceQuote: z.string().optional(),
  state: z.enum(["suggested", "confirmed", "removed"]),
  /** A held claim (a statistic, an award) is shown but cannot be confirmed. */
  held: z.boolean(),
});
export type Fact = z.output<typeof factSchema>;

const factsSchema = z.object({
  builtAt: z.string().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
  facts: z.array(z.unknown()),
});

export interface FactsView {
  readonly builtAt: string | null;
  /** The business's name and how it sounds, when the website gave them. */
  readonly name: string | null;
  readonly tone: readonly string[];
  readonly facts: readonly Fact[];
}

const postStateSchema = z.enum(["pending", "kept", "dropped"]);

const writtenPostSchema = z.object({
  id: z.string().min(1),
  headline: z.string(),
  caption: z.string(),
  /** The text for each network: a plain string, or `{ text }`. */
  captions: z.record(z.string(), z.unknown()).optional(),
  state: postStateSchema,
  edited: z.boolean().optional(),
  advice: z.string().optional(),
  /** The day the post goes out, `YYYY-MM-DD` (batches written before days were recorded have none). */
  date: z.string().optional(),
  /** The time of day it goes out, `HH:MM` India time, when the posting service says. */
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  /** Sent to be drawn, and has (or is getting) pictures. */
  drawn: z.boolean().optional(),
  /** Its choice, words and day are final. */
  locked: z.boolean().optional(),
  /** Why a kept topic got no picture in a finished draw, in the posting service's own sentence; the topic is open again. */
  notDrawn: z.object({ code: z.string(), message: z.string() }).optional(),
  /** The dropped post this post was written to replace. */
  replaces: z.string().optional(),
  /** The new post written in place of this dropped one. */
  replacedBy: z.string().optional(),
  signoff: z.object({ brandName: z.string().optional(), domain: z.string().optional() }).partial().optional(),
});

export interface WrittenPost {
  readonly id: string;
  readonly headline: string;
  readonly caption: string;
  /** The words each network will post, falling back to the main caption. */
  readonly captions: Readonly<Partial<Record<ChannelPlatform, string>>>;
  readonly state: z.output<typeof postStateSchema>;
  readonly edited: boolean;
  readonly advice: string | null;
  /** The day the post goes out, `YYYY-MM-DD`, or null when the batch has no days. */
  readonly date: string | null;
  /** The time of day it goes out, `HH:MM`, or null when the posting service does not say (then 10:00). */
  readonly time?: string | null;
  /** Sent to be drawn, and has (or is getting) pictures; undefined when the posting service does not say. */
  readonly drawn?: boolean;
  /** Its choice, words and day are final; undefined when the posting service does not say (then the week's own state decides). */
  readonly locked?: boolean;
  /** Set when this kept topic got no picture in a finished draw: the reason in plain words. The topic is open again to keep, drop and edit. */
  readonly notDrawn: { readonly code: string; readonly message: string } | null;
  /** The id of the dropped post this one replaces, or null. */
  readonly replaces?: string | null;
  /** The id of the post written in place of this dropped one, or null. */
  readonly replacedBy?: string | null;
}

/** One week of a plan: the Monday it starts, the Sunday it ends, where its pictures stand, and which posts are in it. */
export interface BatchWeek {
  readonly from: string;
  readonly to: string;
  /** waiting: choices open; drawing: pictures being made; drawn: final; not_drawn: the draw ran but no kept topic got a picture; lapsed: the week passed before its pictures were drawn. */
  readonly state: "waiting" | "drawing" | "partly_drawn" | "drawn" | "not_drawn" | "lapsed" | "empty";
  readonly postIds: readonly string[];
  /** The posts of this week that can still be kept, dropped, changed or moved; absent when none (or the week is closed). */
  readonly openPostIds?: readonly string[];
  /** The kept topics of a drawn week that have no picture, each with its reason; empty when every kept topic has one. */
  readonly notDrawn: readonly { readonly postId: string; readonly code: string; readonly message: string }[];
  /** Days of this week with no post, `YYYY-MM-DD`; empty when none is missing. */
  readonly missingDays: readonly string[];
  /** How many dropped posts of this week can still be given a new topic, or null when the posting service does not say. */
  readonly replacementsLeft?: number | null;
}

/** How long a network's caption may be, and what reads best there. */
export interface NetworkRule {
  readonly maxCaption: number;
  readonly recommendedMin: number | null;
  readonly recommendedMax: number | null;
  readonly maxHashtags: number | null;
}

export interface WrittenBatch {
  readonly id: string;
  readonly createdAt: string;
  readonly networks: readonly ChannelPlatform[];
  readonly posts: readonly WrittenPost[];
  /** The length each network allows, as social-auto sends it with the batches. */
  readonly rules: Readonly<Partial<Record<ChannelPlatform, NetworkRule>>>;
  /** The weeks of the plan, or null for a batch drawn in one piece (or when the weeks could not be read, so it is shown as one). */
  readonly weeks: readonly BatchWeek[] | null;
}

const batchSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  networks: z.array(z.string()),
  posts: z.array(z.unknown()),
  /** The weeks of a plan that runs over several weeks; absent on a batch that is drawn in one piece. */
  weeks: z.array(z.unknown()).optional(),
});
const batchWeekSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  state: z.enum(["waiting", "drawing", "partly_drawn", "drawn", "not_drawn", "lapsed", "empty"]),
  postIds: z.array(z.string()),
  openPostIds: z.array(z.string()).optional(),
  notDrawn: z.array(z.object({ postId: z.string(), code: z.string(), message: z.string() })).optional(),
  /** Days of the week that were asked for but have no post (the writer could not make one). */
  missingDays: z.array(z.string()).optional(),
  replacementsLeft: z.number().int().nonnegative().optional(),
});

export const posterSchema = z.object({
  id: z.string().min(1),
  batchId: z.string().min(1),
  postId: z.string().min(1),
  network: platformSchema,
  shape: z.string(),
  width: z.number(),
  height: z.number(),
  headline: z.string(),
  caption: z.string(),
  versionNumber: z.number().int(),
  status: z.enum(["pending", "approved", "rejected", "blocked", "superseded", "held", "expired"]),
  /** A plain sentence for a picture that did not pass the checks, or one that needs confirming again. */
  notice: z.string().optional(),
  canRedraw: z.boolean(),
  redrawsLeft: z.number().int(),
  /** The other networks whose current picture of the same post is this very drawing, so the customer knows a redraw would make this one its own. */
  sharedWith: z.array(platformSchema).optional(),
  createdAt: z.string(),
  /** The day and time (India) the post is planned for, when the posting service says; a post moved to another day shows its new one. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});
export type Poster = z.output<typeof posterSchema>;

const asNetwork = (value: string): ChannelPlatform[] => (CHANNEL_PLATFORMS.some((platform) => platform === value) ? [value as ChannelPlatform] : []);

function captionText(value: unknown): string | null {
  if (typeof value === "string") return value;
  const text = (value as { text?: unknown } | null)?.text;
  return typeof text === "string" ? text : null;
}

/** The job of a start or draw answer (`{ job, created }`), or null when it is not that. */
export function readJob(body: unknown): { readonly job: SiteJob; readonly created: boolean } | null {
  const parsed = jobSchema.safeParse((body as { job?: unknown } | null)?.job);
  return parsed.success ? { job: parsed.data, created: (body as { created?: unknown }).created !== false } : null;
}

/** The jobs of a list answer (`{ jobs: [...] }`), newest first as social-auto sends them. */
export function readJobs(body: unknown): SiteJob[] {
  const jobs = (body as { jobs?: unknown } | null)?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((item): SiteJob[] => {
    const parsed = jobSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The facts answer, or null when it is not that. Tone may arrive as a list or one sentence. */
export function readFacts(body: unknown): FactsView | null {
  const parsed = factsSchema.safeParse(body);
  if (!parsed.success) return null;
  const profile = parsed.data.profile ?? {};
  const tone = profile["tone"];
  return {
    builtAt: parsed.data.builtAt ?? null,
    name: typeof profile["name"] === "string" ? profile["name"] : null,
    tone: Array.isArray(tone) ? tone.filter((item): item is string => typeof item === "string") : typeof tone === "string" && tone !== "" ? [tone] : [],
    facts: parsed.data.facts.flatMap((item): Fact[] => {
      const fact = factSchema.safeParse(item);
      return fact.success ? [fact.data] : [];
    }),
  };
}

const ruleSchema = z.object({ maxCaption: z.number().int().positive(), recommendedMin: z.number().int().optional(), recommendedMax: z.number().int().optional(), maxHashtags: z.number().int().optional() });

/** Each network's caption rule from an answer's `networkRules`; a network without a readable rule is left out. */
export function readNetworkRules(raw: unknown): Partial<Record<ChannelPlatform, NetworkRule>> {
  const rules: Partial<Record<ChannelPlatform, NetworkRule>> = {};
  if (typeof raw !== "object" || raw === null) return rules;
  for (const network of CHANNEL_PLATFORMS) {
    const parsed = ruleSchema.safeParse((raw as Record<string, unknown>)[network]);
    if (parsed.success) rules[network] = { maxCaption: parsed.data.maxCaption, recommendedMin: parsed.data.recommendedMin ?? null, recommendedMax: parsed.data.recommendedMax ?? null, maxHashtags: parsed.data.maxHashtags ?? null };
  }
  return rules;
}

/** The written posts of a batches answer (`{ batches: [...], networkRules }`). */
export function readBatches(body: unknown): WrittenBatch[] {
  const batches = (body as { batches?: unknown } | null)?.batches;
  if (!Array.isArray(batches)) return [];
  const rules = readNetworkRules((body as { networkRules?: unknown }).networkRules);
  return batches.flatMap((item): WrittenBatch[] => {
    const batch = batchSchema.safeParse(item);
    if (!batch.success) return [];
    const networks = batch.data.networks.flatMap(asNetwork);
    const posts = batch.data.posts.flatMap((entry): WrittenPost[] => {
      const post = writtenPostSchema.safeParse(entry);
      if (!post.success) return [];
      const captions: Partial<Record<ChannelPlatform, string>> = {};
      for (const network of networks) captions[network] = captionText(post.data.captions?.[network]) ?? post.data.caption;
      return [{ id: post.data.id, headline: post.data.headline, caption: post.data.caption, captions, state: post.data.state, edited: post.data.edited === true, advice: post.data.advice ?? null, date: post.data.date?.slice(0, 10) ?? null, time: post.data.time ?? null, ...(post.data.drawn === undefined ? {} : { drawn: post.data.drawn }), ...(post.data.locked === undefined ? {} : { locked: post.data.locked }), notDrawn: post.data.notDrawn ?? null, replaces: post.data.replaces ?? null, replacedBy: post.data.replacedBy ?? null }];
    });
    // Weeks are shown only when every one of them can be read: one unreadable week would hide posts, so the batch is shown as one piece.
    const weeks = batch.data.weeks?.map((entry) => batchWeekSchema.safeParse(entry));
    const readable = weeks !== undefined && weeks.length > 0 && weeks.every((week) => week.success) ? weeks.flatMap((week) => (week.success ? [{ ...week.data, notDrawn: week.data.notDrawn ?? [], missingDays: week.data.missingDays ?? [], replacementsLeft: week.data.replacementsLeft ?? null, openPostIds: week.data.openPostIds ?? [] }] : [])) : null;
    return [{ id: batch.data.id, createdAt: batch.data.createdAt, networks, posts, rules, weeks: readable }];
  });
}

/** Where the customer's month stands: when the plan starts and ends, and whether the next month can be written now. */
export interface BatchPlan {
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly canStartNext: boolean;
  /** The Monday the next month would start, `YYYY-MM-DD`; null when social-auto does not say. */
  readonly nextStartDate: string | null;
}

const dayOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((value) => value.slice(0, 10));
const batchPlanSchema = z.object({ startsOn: dayOnly.nullish(), endsOn: dayOnly.nullish(), canStartNext: z.boolean(), nextStartDate: dayOnly.nullish() });

/** The plan of a batches answer (`{ plan: {...} }`); null when the posting service does not send one (an older one) or it cannot be read. */
export function readBatchPlan(body: unknown): BatchPlan | null {
  const parsed = batchPlanSchema.safeParse((body as { plan?: unknown } | null)?.plan);
  return parsed.success ? { startsOn: parsed.data.startsOn ?? null, endsOn: parsed.data.endsOn ?? null, canStartNext: parsed.data.canStartNext, nextStartDate: parsed.data.nextStartDate ?? null } : null;
}

/** A batch of written posts that was put away because nobody decided within 14 days. */
export interface ExpiredBatch {
  readonly id: string;
  /** When it was put away, an ISO time. */
  readonly expiredAt: string;
}

/** The expired batches of a batches answer (`{ expired: [{ id, expiredAt }] }`); empty when the shape is not that. */
export function readExpiredBatches(body: unknown): ExpiredBatch[] {
  const expired = (body as { expired?: unknown } | null)?.expired;
  if (!Array.isArray(expired)) return [];
  return expired.flatMap((item): ExpiredBatch[] => {
    const parsed = z.object({ id: z.string().min(1), expiredAt: z.string().min(1) }).safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The pictures of a posters answer (`{ posters: [...], reasons }`). */
export function readPosters(body: unknown): { readonly posters: Poster[]; readonly reasons: string[] } {
  const raw = body as { posters?: unknown; reasons?: unknown } | null;
  const posters = Array.isArray(raw?.posters)
    ? raw.posters.flatMap((item): Poster[] => {
        const parsed = posterSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const reasons = Array.isArray(raw?.reasons) ? raw.reasons.filter((reason): reason is string => typeof reason === "string") : [];
  return { posters, reasons };
}

/** One post idea and where it stands on each network, with the connected networks it does not have yet. */
export interface Topic {
  readonly batchId: string;
  readonly postId: string;
  readonly headline: string;
  readonly networks: ReadonlyArray<TopicNetwork>;
  readonly missing: readonly ChannelPlatform[];
}

/** One channel of a topic: its picture's status, and where drawing it stands when it has no picture yet. */
export interface TopicNetwork {
  readonly network: ChannelPlatform;
  readonly status: string;
  readonly pictureState?: string;
  readonly drawsOn?: string;
  readonly notDrawn?: { readonly code: string; readonly message: string };
}

const topicSchema = z.object({
  batchId: z.string().min(1),
  postId: z.string().min(1),
  headline: z.string(),
  networks: z.array(
    z.object({
      network: platformSchema,
      status: z.string(),
      /** Where this channel's picture of the topic stands (ready, approved, needs_connection, waiting, drawing, limit_reached, not_drawn, ...). Absent from an older posting service. */
      pictureState: z.string().optional(),
      /** For `waiting`: the day the system draws it (`YYYY-MM-DD`); absent for the first week, which is the customer's button. */
      drawsOn: z.string().optional(),
      notDrawn: z.object({ code: z.string(), message: z.string() }).optional(),
    }),
  ),
  missing: z.array(platformSchema),
});

/** The topics of a topics answer (`{ topics: [...], connected }`); empty when the shape is not that. */
export function readTopics(body: unknown): Topic[] {
  const topics = (body as { topics?: unknown } | null)?.topics;
  if (!Array.isArray(topics)) return [];
  return topics.flatMap((item): Topic[] => {
    const parsed = topicSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Whether a job is still being worked on, so the page keeps asking. */
export const jobIsActive = (job: Pick<SiteJob, "state">): boolean => job.state === "queued" || job.state === "running";

const STEP_WORDS: Readonly<Record<number, string>> = { 1: "Reading your website", 2: "Writing your posts", 3: "Drawing your pictures", 4: "Putting it together for you to review" };

/** What to tell the customer about a job, in plain words. */
export function jobLine(job: Pick<SiteJob, "kind" | "state" | "step">): string {
  if (job.kind === "topic") return job.state === "failed" ? "We could not write your topic. You can try again." : job.state === "done" ? "Your topic is ready to look at." : job.state === "queued" ? "Waiting to start." : "Writing your topic";
  if (job.kind === "replace") return job.state === "failed" ? "We could not write a new topic this time. You can try again." : job.state === "done" ? "Your new topic is ready to look at." : job.state === "queued" ? "Waiting to start." : "Writing a new topic";
  if (job.kind === "carousel") return job.state === "failed" ? "We could not make your carousel. You can try again." : job.state === "done" ? "Your carousel is ready to look at." : job.state === "queued" ? "Waiting to start." : "Making your carousel";
  if (job.state === "failed") return job.kind === "draw" ? "The pictures could not be drawn. You can try again." : job.kind === "network" ? "We could not write your posts for the new network. You can try again." : "We could not write your posts. You can try again.";
  if (job.state === "done") return job.kind === "draw" ? "Your pictures are ready to look at." : job.kind === "network" ? "Your posts for the new network are ready to look at." : "Your posts are written and ready to look at.";
  if (job.state === "queued") return "Waiting to start.";
  return (job.kind === "network" ? undefined : job.step === undefined ? undefined : STEP_WORDS[job.step]) ?? (job.kind === "draw" ? "Drawing your pictures" : job.kind === "network" ? "Writing your posts for the new network" : "Writing your posts");
}

/**
 * What each error code of the AI side means for the customer, in our words. social-auto's own sentences are written for a
 * product, so the page shows these and keeps the code for the log. A code not listed here gets the general sentence.
 */
const CODE_WORDS: Readonly<Record<string, string>> = {
  PAGE_MODE_UNAVAILABLE: "That page could not be read on its own. Use the whole website address instead.",
  INVALID_SITE: "That does not look like a website address. Check it and try again.",
  SITE_MISMATCH: "Your posts are written from the website you gave us first. If your website has changed, ask us and we will update it.",
  INVALID_NETWORKS: "Choose at least one network to write for.",
  CONSENT_REQUIRED: "Tick the box to agree first, then choose the channels.",
  INVALID_DAYS: "Choose at least one day of the week.",
  CHANNEL_DAYS_DIFFER: "Your channels post on different days, so their posts are written one channel at a time. Start them one by one.",
  LAST_BRAND: "Keep at least one brand. Add another before you archive this one.",
  BRAND_LIMIT_REACHED: "You have as many brands as your plan allows. Ask us to allow more.",
  GROUP_MISMATCH: "Something went wrong on our side. Reload the page and try again.",
  WORKSPACE_ARCHIVED: "This brand is archived. Bring it back to use it again.",
  CHANNEL_NOT_CONNECTED: "Connect an account for that network first, then try again.",
  NETWORK_ALREADY_THERE: "Your posts are already written for that network.",
  CONFLICT: "Start from your website first. The carousel is made from what it says.",
  CAROUSEL_LIMIT_REACHED: "You have made this week's carousel already. You can make another next week.",
  CONNECTED_UNKNOWN: "We could not check which of your accounts are connected just now. Try again in a minute.",
  PICTURE_LIMIT_REACHED: "You have used this week's pictures for one of your networks. You can draw more from Monday.",
  JOB_LIMIT_REACHED: "You have started as many batches as you can for now. Try again tomorrow.",
  DRAW_LIMIT_REACHED: "You have asked for as many pictures as you can for now. Try again tomorrow.",
  REPLACE_LIMIT_REACHED: "You have asked for as many new topics as you can this week. You can ask for more from Monday.",
  DAY_PASSED: "The day of this post has passed, so it can no longer be changed.",
  INVALID_DAY: "A topic can only move to another day of its own week.",
  NOTHING_WRITTEN: "We could not write a new topic this time. You can try again.",
  NOTHING_KEPT: "Keep at least one post first, then ask for the pictures.",
  BATCH_LOCKED: "These posts are final now, so they can no longer be changed.",
  WORDS_NOT_ACCEPTED: "Those words do not agree with what is on your website. Change them and try again.",
  FACT_HELD: "We cannot use this one without proof, so it stays as it is.",
  POSTER_SUPERSEDED: "A newer picture replaced this one. Look at the new one instead.",
  CAPTION_REQUIRED: "Write what the post should say.",
  CAPTION_TOO_LONG: "Those words are too long. Make them shorter and try again.",
  NOTHING_TO_CHANGE: "Those are the words it already has. Change them first.",
  POST_ALREADY_SENT: "This post has already gone out on this network, so its words can no longer be changed.",
  POSTER_BLOCKED: "This picture did not pass our checks, so it cannot be approved. You can ask for another.",
  REDRAW_LIMIT_REACHED: "You have already asked for another picture of this one. Drop it or approve it.",
  ENGINE_UNAVAILABLE: "We cannot write posts just now. Try again in a few minutes.",
  SERVICE_UNAVAILABLE: "We cannot reach the posting service just now. Try again in a few minutes.",
  ACTOR_REQUIRED: "Something went wrong on our side. Reload the page and try again.",
  INVALID_ACTOR: "Something went wrong on our side. Reload the page and try again.",
};

export const GENERAL_AI_ERROR = "That did not work. Try again in a few minutes.";

/** The customer's words for a code the page has words for, or null for any other (so the caller can say something more fitting than the general sentence). */
export const knownWordsForCode = (code: string | undefined): string | null => (code === undefined ? null : (CODE_WORDS[code] ?? null));

/** The customer's words for an error code. */
export const wordsForCode = (code: string | null): string => (code === null ? GENERAL_AI_ERROR : (CODE_WORDS[code] ?? GENERAL_AI_ERROR));

/** The customer's words for what a reject reason means, for the choices on a picture. */
export const REJECT_REASON_WORDS: Readonly<Record<string, string>> = {
  weak_copy: "The words are weak",
  irrelevant_image: "The picture does not fit",
  poor_design: "The design is poor",
  incorrect_branding: "The name or logo is wrong",
  factual_issue: "Something in it is not true",
  repetitive: "It repeats an earlier post",
  style: "It does not sound like us",
  other: "Something else",
};

const topicRequestSchema = z.object({
  id: z.string().min(1),
  week: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  goesOutOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goesOutAt: z.string().regex(/^\d{2}:\d{2}$/),
  state: z.enum(["writing", "waiting_for_words", "drawing", "drawn", "not_made"]),
  reason: z.string().optional(),
  createdAt: z.string(),
  batchId: z.string().optional(),
  postId: z.string().optional(),
  words: z.object({ headline: z.string(), captions: z.record(z.string(), z.unknown()).optional() }).optional(),
  picturesToDraw: z.number().int().nonnegative().optional(),
});

/** A topic the customer wrote in her own words: one extra post for one day, written only from her words. */
export interface TopicRequest {
  readonly id: string;
  /** The Monday and Sunday of the week it falls in. */
  readonly week: { readonly from: string; readonly to: string };
  /** The day and time (India) it goes out. */
  readonly goesOutOn: string;
  readonly goesOutAt: string;
  /** writing: being written; waiting_for_words: written, for her to read and keep; drawing: its pictures are being made; drawn: pictures wait for her; not_made: it did not become a post (see `reason`). */
  readonly state: "writing" | "waiting_for_words" | "drawing" | "drawn" | "not_made";
  readonly reason: string | null;
  readonly createdAt: string;
  /** Where its written post is, to keep, change and draw it with the same calls as any other post. */
  readonly batchId: string | null;
  readonly postId: string | null;
  /** The pictures drawing it would make now: the cost to show before she confirms. */
  readonly picturesToDraw: number;
}

/** The requests of a list answer (`{ requests: [...] }`), newest first as social-auto sends them. */
export function readTopicRequests(body: unknown): TopicRequest[] {
  const list = (body as { requests?: unknown } | null)?.requests;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): TopicRequest[] => {
    const parsed = topicRequestSchema.safeParse(item);
    if (!parsed.success) return [];
    const one = parsed.data;
    return [{ id: one.id, week: one.week, goesOutOn: one.goesOutOn, goesOutAt: one.goesOutAt, state: one.state, reason: one.reason ?? null, createdAt: one.createdAt, batchId: one.batchId ?? null, postId: one.postId ?? null, picturesToDraw: one.picturesToDraw ?? 0 }];
  });
}

/** The customer's words for why a topic did not become a post. */
export const TOPIC_NOT_MADE_WORDS: Readonly<Record<string, string>> = {
  NOT_WRITTEN: "We could not write a post from those words. You can try again with a few more details.",
  TEXT_REFUSED: "We could not use those words as they are. Say it in plain words, without claims we cannot check.",
  DROPPED: "You dropped this topic.",
  PUT_AWAY: "This topic was put away.",
  WEEK_PASSED: "Its week has passed.",
  DRAW_FAILED: "The pictures could not be drawn. You can ask again.",
  NO_PICTURE_ROOM: "No pictures are left this week for one of your channels. You can draw it from Monday.",
  NO_PICTURE: "No picture could be made for it.",
  HEADLINE_TOO_WEAK: "Its headline is too weak to draw. Change the headline and draw again.",
  FACT_OUT_OF_DATE: "Something in it is out of date. Write it again with the new details.",
};
