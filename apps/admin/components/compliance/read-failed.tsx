import Link from "next/link";
import type { ReactElement } from "react";
import { ErrorState } from "@brandbasket/shared/ui/patterns";
import { buttonSecondary } from "@/components/console/buttons";

/** A tab whose list could not be read: nothing was changed, and the clocks keep running while it is down. */
export function ReadFailed({ title, message, href }: { readonly title: string; readonly message: string; readonly href: string }): ReactElement {
  return (
    <div className="mt-6">
      <ErrorState
        title={title}
        message={message}
        secondaryAction={
          <Link href={href} className={buttonSecondary}>
            Try again
          </Link>
        }
      />
    </div>
  );
}
