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
          That page does <em>not exist.</em>
        </>
      }
      lede="The link may be old, or the page was moved. Everything you need is reachable from Today."
    >
      <div className="flex justify-center py-2">
        <Link href="/" className={buttonPrimary}>
          Back to Today
        </Link>
      </div>
    </QuietFrame>
  );
}
