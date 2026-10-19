import type { ReactElement } from "react";
import { displayBusinessId } from "@/lib/business-profile";

/**
 * The business's Business ID, its permanent id on Brandbasket, as the owner reads it: in capitals, spaced for reading out
 * on the phone. It never changes, whatever else about the business does.
 */
export function BusinessIdLine({ placeId }: { readonly placeId: string }): ReactElement {
  return (
    <div>
      <p className="text-[0.8125rem] text-ink-soft">Business ID</p>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.18em] tabular-nums">{displayBusinessId(placeId)}</p>
    </div>
  );
}
