import type { ReactElement } from "react";
import { NotFoundView } from "@/components/console/not-found-view";

/**
 * Unmatched staff console URLs render the console's own 404 instead of the marketing one.
 *
 * Renders directly rather than calling next/navigation's `notFound()` — see ../../app-host/[...missing]/page.tsx
 * for why (the same fix, same root cause: this app's multi-root-layout setup gives a `notFound()`-triggered
 * boundary Next's generic `__next_error__` shell instead of this segment's own root layout).
 */
export default function AdminMissingPage(): ReactElement {
  return <NotFoundView />;
}
