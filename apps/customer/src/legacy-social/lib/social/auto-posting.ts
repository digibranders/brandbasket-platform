import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/*
 * Automatic posting, as the posting service holds it (`autoPosting` in the workspace read). The customer chooses which of her channels
 * post by themselves; for those, pictures that passed every check are approved by the system inside a safety window before posting, and
 * she can still reject one before it goes out. Her own topics, carousels, topics with a warning and blocked pictures stay hers.
 */

/** The hours before posting time in which the system may approve a picture, as the customer can pick them. */
export const SAFETY_HOURS = [0, 6, 12, 24, 48, 72] as const;
export const DEFAULT_SAFETY_HOURS = 24;

export interface AutoPosting {
  /** The channels the system posts for. */
  readonly channels: readonly ChannelPlatform[];
  readonly safetyHours: number;
  /** When she agreed, or null before she has. */
  readonly consentedAt: string | null;
  /** Connected channels that are not automatic: the ones to ask her about again. */
  readonly needsChoice: readonly ChannelPlatform[];
}

/** What the posting service has: `null` when it has no automatic posting (an older one), so the page offers no choice. */
export type AutoPostingState = AutoPosting | null;

const isPlatform = (value: unknown): value is ChannelPlatform => typeof value === "string" && (CHANNEL_PLATFORMS as readonly string[]).includes(value);
const platforms = (value: unknown): ChannelPlatform[] => (Array.isArray(value) ? CHANNEL_PLATFORMS.filter((platform) => value.includes(platform)) : []);

/**
 * Reads `workspace.autoPosting` from a workspace answer. A service with no such field is an older one (`null`: nothing to choose); a field
 * that is `null` is a service that has it and a customer who has not chosen, which reads as nothing automatic and every channel to ask about.
 */
export function readAutoPosting(body: unknown, connected: readonly ChannelPlatform[]): AutoPostingState {
  const workspace = (body as { workspace?: Record<string, unknown> } | null)?.workspace;
  if (workspace === undefined || workspace === null || typeof workspace !== "object" || !("autoPosting" in workspace)) return null;
  const raw = workspace["autoPosting"] as { channels?: unknown; safetyHours?: unknown; consentedAt?: unknown; needsChoice?: unknown } | null;
  if (raw === null || typeof raw !== "object") return { channels: [], safetyHours: DEFAULT_SAFETY_HOURS, consentedAt: null, needsChoice: connected.filter(isPlatform) };
  const hours = typeof raw.safetyHours === "number" && Number.isFinite(raw.safetyHours) ? Math.min(72, Math.max(0, Math.round(raw.safetyHours))) : DEFAULT_SAFETY_HOURS;
  return { channels: platforms(raw.channels), safetyHours: hours, consentedAt: typeof raw.consentedAt === "string" ? raw.consentedAt : null, needsChoice: platforms(raw.needsChoice) };
}

/** "24 hours before it goes out", "no wait (right when it is due)". */
export function safetyWords(hours: number): string {
  return hours === 0 ? "No wait: right before it goes out" : `${hours} ${hours === 1 ? "hour" : "hours"} before it goes out`;
}

/** The words a customer agrees to when she lets us post for her. Shown beside the box she ticks. */
export const AUTO_POSTING_CONSENT =
  "I agree that Brandbasket may approve and post for the channels I chose, without me approving each one, when the post passes our checks. Posts go out only after the safety wait I chose, I can reject any post before it goes out, and I can switch this off at any time. I know the posts are written from my website and I stay responsible for what is published on my accounts.";
