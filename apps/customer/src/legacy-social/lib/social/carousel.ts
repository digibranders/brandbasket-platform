import { z } from "zod";
import { isChannelPlatform, type ChannelPlatform } from "./auto";

/*
 * The carousel of the week: one post of 3 to 5 slides, the same slides on every connected channel and the words written for each.
 * The customer decides the whole carousel at once, never one slide. These read what the posting service sends and give the page
 * words for each state.
 */

/**
 * Where a carousel stands. It starts as a `topic` (words only, no pictures), she keeps or drops it like any topic, and only a kept one is
 * drawn (`drawing`, then `pending` for her OK). `incomplete` is an older carousel still being made.
 */
export const CAROUSEL_STATUSES = ["incomplete", "topic", "kept", "dropped", "drawing", "pending", "approved", "rejected", "blocked"] as const;
export type CarouselStatus = (typeof CAROUSEL_STATUSES)[number];

const statusSchema = z.enum(CAROUSEL_STATUSES);

/** One line of the list answer: which carousel, for what day, and where it stands. */
export interface CarouselSummary {
  readonly id: string;
  readonly topic: string | null;
  /** The day it is for, `YYYY-MM-DD`; null when the posting service does not say. */
  readonly date: string | null;
  readonly count: number;
  readonly status: CarouselStatus;
  /** The headline of each slide in order; empty when the posting service does not say. */
  readonly headlines: readonly string[];
}

/** Whether the slides were drawn, so there is something to look at and approve. */
export const carouselDrawn = (status: CarouselStatus): boolean => status === "pending" || status === "approved";

/** Whether the carousel can still be moved to another day: any carousel that is still wanted. */
export const carouselMovable = (status: CarouselStatus): boolean => status === "topic" || status === "kept" || status === "pending" || status === "approved";

/** One carousel in full: its slides, and the words each channel will post with it. */
export interface CarouselDetail {
  readonly id: string;
  readonly count: number;
  readonly status: CarouselStatus;
  readonly slides: readonly { readonly position: number; readonly status: string; /** The slide's headline, when the posting service says it. */ readonly headline?: string }[];
  readonly captions: readonly { readonly network: ChannelPlatform; readonly caption: string; readonly status: string }[];
  /** The reasons a carousel may be sent back with, as the posting service names them. */
  readonly reasons: readonly string[];
}

const summarySchema = z.object({
  id: z.string().min(1),
  topic: z.string().nullish(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/)
    .nullish(),
  count: z.number().int().nonnegative(),
  status: statusSchema,
  headlines: z.array(z.string().nullish()).nullish(),
});

/** The carousels of a list answer (`{ carousels: [...] }`), newest first as the posting service sends them; anything unreadable is left out. */
export function readCarousels(body: unknown): CarouselSummary[] {
  const list = (body as { carousels?: unknown } | null)?.carousels;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item): CarouselSummary[] => {
    const parsed = summarySchema.safeParse(item);
    return parsed.success ? [{ id: parsed.data.id, topic: parsed.data.topic ?? null, date: parsed.data.date?.slice(0, 10) ?? null, count: parsed.data.count, status: parsed.data.status, headlines: (parsed.data.headlines ?? []).map((headline) => (typeof headline === "string" ? headline.trim() : "")) }] : [];
  });
}

/** Whether the weekly carousel is switched on, from a list answer (`{ weekly }`); off when the posting service does not say. */
export function readCarouselWeekly(body: unknown): boolean {
  return (body as { weekly?: unknown } | null)?.weekly === true;
}

const detailSchema = z.object({
  id: z.string().min(1),
  count: z.number().int().nonnegative(),
  status: statusSchema,
  slides: z.array(z.object({ position: z.number().int().positive(), status: z.string(), headline: z.string().nullish() })),
  captions: z.array(z.object({ network: z.string(), caption: z.string(), status: z.string() })).optional(),
});

/** One carousel from a detail answer (`{ carousel: {...}, reasons }`); null when it is not that. */
export function readCarousel(body: unknown): CarouselDetail | null {
  const raw = body as { carousel?: unknown; reasons?: unknown } | null;
  const parsed = detailSchema.safeParse(raw?.carousel);
  if (!parsed.success) return null;
  return {
    id: parsed.data.id,
    count: parsed.data.count,
    status: parsed.data.status,
    slides: [...parsed.data.slides].sort((a, b) => a.position - b.position).map((slide) => (typeof slide.headline === "string" && slide.headline.trim() !== "" ? { position: slide.position, status: slide.status, headline: slide.headline.trim() } : { position: slide.position, status: slide.status })),
    captions: (parsed.data.captions ?? []).flatMap((entry) => (isChannelPlatform(entry.network) ? [{ network: entry.network, caption: entry.caption, status: entry.status }] : [])),
    reasons: Array.isArray(raw?.reasons) ? raw.reasons.filter((reason): reason is string => typeof reason === "string") : [],
  };
}

/** Where the customer's carousel stands, in plain words. */
export const CAROUSEL_STATUS_WORDS: Readonly<Record<CarouselStatus, string>> = {
  incomplete: "We are making your carousel",
  topic: "Not decided",
  kept: "Kept",
  dropped: "Dropped",
  drawing: "Drawing the slides",
  pending: "Waiting for your OK",
  approved: "Approved",
  rejected: "Sent back",
  blocked: "A slide did not pass our checks",
};

/** The slide address the page shows: our own route, which asks the posting service with the signed-in customer's own brand. */
export const carouselSlideUrl = (carouselId: string, position: number): string => `/api/social-carousels/slide?${new URLSearchParams({ id: carouselId, slide: String(position) })}`;
