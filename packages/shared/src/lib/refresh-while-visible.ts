/*
 * Keeps a bell fresh without a websocket: ask the server for new data every interval while the page is visible, and when the
 * window gets focus or the page becomes visible again. The apps pass their own refresh (router.refresh, which re-runs the
 * server loader). Pure and DOM-free so it is testable; browserHost adapts window and document.
 */

/** The least time between two refreshes caused by focus, so switching windows quickly does not hammer the server. */
const FOCUS_REFRESH_MIN_MS = 10_000;

export interface RefreshHost {
  readonly isVisible: () => boolean;
  /** Listens for "focus" or "visibilitychange"; returns the function that stops listening. */
  readonly on: (event: "focus" | "visibilitychange", handler: () => void) => () => void;
}

/** Starts refreshing. Returns the cleanup that stops the timer and the listeners. */
export function startRefreshing(refresh: () => void, host: RefreshHost, intervalMs: number, now: () => number = Date.now): () => void {
  let last = now();
  const run = (): void => {
    last = now();
    refresh();
  };
  const timer = setInterval(() => {
    if (host.isVisible()) run();
  }, intervalMs);
  const onReturn = (): void => {
    if (host.isVisible() && now() - last >= FOCUS_REFRESH_MIN_MS) run();
  };
  const stopFocus = host.on("focus", onReturn);
  const stopVisibility = host.on("visibilitychange", onReturn);
  return () => {
    clearInterval(timer);
    stopFocus();
    stopVisibility();
  };
}

/** The real browser: window focus and document visibility. */
export function browserHost(win: Window, doc: Document): RefreshHost {
  return {
    isVisible: () => doc.visibilityState === "visible",
    on: (event, handler) => {
      const target = event === "focus" ? win : doc;
      target.addEventListener(event, handler);
      return () => target.removeEventListener(event, handler);
    },
  };
}
