import type { SiteJob } from "./ai";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/*
 * What the channels column shows about work in the background: a channel is "working" while something is being written or drawn for it,
 * and "ready" once that work finished after the last time the customer looked at the channel. Looking is pressing the channel, or
 * pressing anywhere on its page while it is ready.
 */

/** The jobs that write or draw something a customer looks over: not the small ones that write one topic. */
const WORK_KINDS: readonly SiteJob["kind"][] = ["write", "draw", "network", "carousel"];

export interface ChannelActivity {
  /** The channels something is being written or drawn for right now. */
  readonly working: ReadonlySet<ChannelPlatform>;
  /** For each channel, when the newest finished work for it ended (ISO 8601). */
  readonly doneAt: Readonly<Partial<Record<ChannelPlatform, string>>>;
}

/**
 * The channels a job is for: the ones the posting service names, else the ones of the batch it draws, else every connected channel.
 * A channel that is not connected is left out.
 */
export function jobChannels(job: SiteJob, connected: readonly ChannelPlatform[], batchNetworks: (batchId: string) => readonly ChannelPlatform[] | undefined): ChannelPlatform[] {
  const named = job.networks ?? (job.batchId === undefined ? undefined : batchNetworks(job.batchId));
  const wanted = named === undefined || named.length === 0 ? connected : named;
  return CHANNEL_PLATFORMS.filter((platform) => connected.includes(platform) && wanted.includes(platform));
}

export function channelActivity(jobs: readonly SiteJob[], connected: readonly ChannelPlatform[], batchNetworks: (batchId: string) => readonly ChannelPlatform[] | undefined): ChannelActivity {
  const working = new Set<ChannelPlatform>();
  const doneAt: Partial<Record<ChannelPlatform, string>> = {};
  for (const job of jobs) {
    if (!WORK_KINDS.includes(job.kind)) continue;
    const channels = jobChannels(job, connected, batchNetworks);
    if (job.state === "queued" || job.state === "running") channels.forEach((platform) => working.add(platform));
    else if (job.state === "done" && job.finishedAt !== undefined) {
      for (const platform of channels) {
        const known = doneAt[platform];
        if (known === undefined || job.finishedAt > known) doneAt[platform] = job.finishedAt;
      }
    }
  }
  return { working, doneAt };
}

/** What the customer has already looked at: when this screen first saw the brand, and when each channel was last looked at. */
export interface SeenChannels {
  readonly baselineAt: string;
  readonly seen: Readonly<Partial<Record<ChannelPlatform, string>>>;
}

/** Whether work for the channel finished since the customer last looked at it (and is not running again). Work from before the first visit is not news. */
export function isReady(activity: ChannelActivity, seen: SeenChannels | null, platform: ChannelPlatform): boolean {
  if (seen === null || activity.working.has(platform)) return false;
  const done = activity.doneAt[platform];
  return done !== undefined && done > (seen.seen[platform] ?? seen.baselineAt);
}

const key = (brandId: string): string => `social-channels-seen:${brandId}`;

/** The saved record for a brand; a first visit starts one now, so only work that ends later is news. Null when the browser keeps nothing. */
export function loadSeen(brandId: string, now: Date, storage: Pick<Storage, "getItem" | "setItem"> | undefined): SeenChannels | null {
  if (storage === undefined) return null;
  try {
    const saved = storage.getItem(key(brandId));
    if (saved !== null) {
      const parsed = JSON.parse(saved) as { baselineAt?: unknown; seen?: unknown };
      if (typeof parsed.baselineAt === "string" && typeof parsed.seen === "object" && parsed.seen !== null) return { baselineAt: parsed.baselineAt, seen: parsed.seen as SeenChannels["seen"] };
    }
    const fresh: SeenChannels = { baselineAt: now.toISOString(), seen: {} };
    storage.setItem(key(brandId), JSON.stringify(fresh));
    return fresh;
  } catch {
    return null;
  }
}

/** Notes that the customer looked at a channel just now. */
export function markSeen(brandId: string, current: SeenChannels, platform: ChannelPlatform, now: Date, storage: Pick<Storage, "setItem"> | undefined): SeenChannels {
  const next: SeenChannels = { baselineAt: current.baselineAt, seen: { ...current.seen, [platform]: now.toISOString() } };
  try {
    storage?.setItem(key(brandId), JSON.stringify(next));
  } catch {
    // The record is a convenience: when the browser keeps nothing, the green simply clears for this visit.
  }
  return next;
}
