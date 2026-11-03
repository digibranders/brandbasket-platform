"use client";

import { RouteError } from "../../route-error";

/** A failure the dashboard's own panels did not catch (the guard's read, say): inside the frame, with Try again. */
export default function AffiliateError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
