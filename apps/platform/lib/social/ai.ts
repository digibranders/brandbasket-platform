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
  kind: z.enum(["write", "draw", "network"]),
  state: z.enum(["queued", "running", "done", "failed"]),
  /** 1 to 4 while it runs: reading the website, writing, drawing, putting the results in review. */
  step: z.number().int().optional(),
  batchId: z.string().optional(),
  createdAt: z.string(),
  finishedAt: z.string().optional(),
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
}

const batchSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  networks: z.array(z.string()),
  posts: z.array(z.unknown()),
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
      return [{ id: post.data.id, headline: post.data.headline, caption: post.data.caption, captions, state: post.data.state, edited: post.data.edited === true, advice: post.data.advice ?? null }];
    });
    return [{ id: batch.data.id, createdAt: batch.data.createdAt, networks, posts, rules }];
  });
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
  readonly networks: ReadonlyArray<{ readonly network: ChannelPlatform; readonly status: string }>;
  readonly missing: readonly ChannelPlatform[];
}

const topicSchema = z.object({
  batchId: z.string().min(1),
  postId: z.string().min(1),
  headline: z.string(),
  networks: z.array(z.object({ network: platformSchema, status: z.string() })),
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
  INVALID_SITE: "That does not look like a website address. Check it and try again.",
  SITE_MISMATCH: "Your posts are written from the website you gave us first. If your website has changed, ask us and we will update it.",
  INVALID_NETWORKS: "Choose at least one network to write for.",
  LAST_BRAND: "Keep at least one brand. Add another before you archive this one.",
  BRAND_LIMIT_REACHED: "You have as many brands as your plan allows. Ask us to allow more.",
  GROUP_MISMATCH: "Something went wrong on our side. Reload the page and try again.",
  WORKSPACE_ARCHIVED: "This brand is archived. Bring it back to use it again.",
  CHANNEL_NOT_CONNECTED: "Connect an account for that network first, then try again.",
  NETWORK_ALREADY_THERE: "Your posts are already written for that network.",
  JOB_LIMIT_REACHED: "You have started as many batches as you can for now. Try again tomorrow.",
  DRAW_LIMIT_REACHED: "You have asked for as many pictures as you can for now. Try again tomorrow.",
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
