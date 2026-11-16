"use client";

import type { ReactElement } from "react";
import { ErrorState } from "@brandbasket/shared/ui/patterns";
import { Skeleton } from "@brandbasket/shared/ui/patterns";

/** A list screen while it loads: the header, a row of figures and a table, as warm blocks the size of the real ones. */
export function ListSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <Skeleton width={220} height={32} rounded="control" />
      <Skeleton width={340} height={16} rounded="control" className="mt-3" />
      <Skeleton height={92} className="mt-6" />
      <div className="mt-6 grid gap-2">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} height={44} rounded="control" />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface RouteErrorProps {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}

/**
 * The error screen of a console section: what happened, the next step, and a button that tries again. The shell stays,
 * so staff can leave through the rail. Only the digest is shown, never the message (apps/admin/DESIGN.md).
 */
export function RouteError({ error, reset }: RouteErrorProps): ReactElement {
  return (
    <ErrorState
      title="This page could not load"
      message={`Nothing was changed. Try again, and if it keeps failing tell the owner${error.digest === undefined ? "" : ` and give them this code: ${error.digest}`}.`}
      retryAction={{ label: "Try again", onClick: reset }}
    />
  );
}
