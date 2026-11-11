"use client";

import { RouteError } from "../../../route-error";

/** The setup page's own failure (the link lookup, say): what failed and Try again, inside the entry frame. */
export default function AffiliateSetupError({ error, retry }: { readonly error: unknown; readonly retry: () => void }) {
  return <RouteError error={error} retry={retry} />;
}
