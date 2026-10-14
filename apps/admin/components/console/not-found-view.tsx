import Link from "next/link";
import type { ReactElement } from "react";
import { buttonPrimary } from "./buttons";
import { QuietFrame } from "./quiet-frame";

/** The console's own 404, so a mistyped address stays inside the staff console's look. */
export function NotFoundView(): ReactElement {
  return (
    <QuietFrame
      title={
        <>
          Nothing <em>here.</em>
        </>
      }
      lede="That page doesn’t exist, or it has moved."
    >
      <div className="flex justify-center py-2">
        <Link href="/" className={buttonPrimary}>
          Back to the journey
        </Link>
      </div>
    </QuietFrame>
  );
}
