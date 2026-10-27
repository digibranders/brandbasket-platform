import { z } from "zod";
import { SUPPORT_CATEGORIES, type SupportCategory } from "@brandbasket/shared/lib/support";
import type { RequestQueue } from "./reply-clock";

export interface RequestFilters {
  readonly queue: RequestQueue;
  /** Only requests assigned to the signed-in staff member. */
  readonly mine: boolean;
  readonly category?: SupportCategory;
  readonly search?: string;
  readonly cursor?: string;
}

const schema = z.object({
  queue: z.enum(["needs_reply", "waiting_on_client", "done"]).catch("needs_reply"),
  mine: z.literal("1").optional().catch(undefined),
  category: z.enum(SUPPORT_CATEGORIES).optional().catch(undefined),
  search: z.string().trim().min(1).max(120).optional().catch(undefined),
  cursor: z.uuid().optional().catch(undefined),
});

type RawParams = Readonly<Record<string, string | string[] | undefined>>;

/** The list's filters from the address. A value the page does not know is dropped, never an error. */
export function readRequestFilters(raw: RawParams): RequestFilters {
  const single = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value === "" ? undefined : value]));
  const parsed = schema.parse({ queue: single.queue ?? "needs_reply", ...single });
  return {
    queue: parsed.queue,
    mine: parsed.mine === "1",
    ...(parsed.category === undefined ? {} : { category: parsed.category }),
    ...(parsed.search === undefined ? {} : { search: parsed.search }),
    ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor }),
  };
}

/** A link to the list with some filters changed. Any change but the cursor starts again from the first page. */
export function requestsHref(filters: RequestFilters, change: Partial<RequestFilters>): string {
  const next: RequestFilters = { ...filters, ...change, cursor: change.cursor };
  const params = new URLSearchParams();
  if (next.queue !== "needs_reply") params.set("queue", next.queue);
  if (next.mine) params.set("mine", "1");
  if (next.category !== undefined) params.set("category", next.category);
  if (next.search !== undefined && next.search !== "") params.set("search", next.search);
  if (next.cursor !== undefined) params.set("cursor", next.cursor);
  const query = params.toString();
  return query === "" ? "/support" : `/support?${query}`;
}
