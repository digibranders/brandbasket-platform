import { unstable_rethrow } from "next/navigation";
import { reportError } from "./report";

/** Why a panel has no data. Shown by the panel's error state; the error itself went to Sentry. */
export interface LoadFailure {
  /** When it failed, for the "quote this time" line of the error banner. */
  readonly at: Date;
  /** The Sentry event id, when Sentry is on. */
  readonly eventId?: string;
}

/** What a loader returns per panel (BUILD-RULES rule 6): the data, or a typed failure the panel renders. */
export type Loaded<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: LoadFailure };

/**
 * Runs one panel's loader. A failure is reported to Sentry and returned as `{ ok: false }`, so one failed panel never takes
 * the page down and is never silently hidden. Next's own control flow (redirect, notFound, dynamic rendering bail-outs) is
 * rethrown, never caught.
 */
export async function load<T>(area: string, loader: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await loader() };
  } catch (error) {
    unstable_rethrow(error);
    const eventId = reportError(error, { area });
    return { ok: false, error: eventId === undefined ? { at: new Date() } : { at: new Date(), eventId } };
  }
}
