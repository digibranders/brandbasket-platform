/** Where the Requests pages live. Plain strings, so a client component (the rail) can import them. */
export const REQUESTS_PATH = "/requests";
export const ASK_FOR_A_CHANGE_PATH = "/requests/new";

/** What a refused move or a payment coming back says on the Requests page. */
export type RequestNotice = "changed" | "window" | "failed";

/** The Requests page with one request open, and a word about what just happened when there is one. */
export function requestHref(ticketId: string, notice?: RequestNotice): string {
  return `${REQUESTS_PATH}?open=${ticketId}${notice === undefined ? "" : `&notice=${notice}`}`;
}

/** A row of the list: the request opened, with the list it sits in kept (Open or Done). */
export function listRowHref(ticketId: string, filter: "open" | "done"): string {
  return `${REQUESTS_PATH}?filter=${filter}&open=${ticketId}`;
}

/** The list on its own, filtered. */
export function listHref(filter: "open" | "done"): string {
  return `${REQUESTS_PATH}?filter=${filter}`;
}
