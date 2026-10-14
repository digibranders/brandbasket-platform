import { Fragment, type ReactElement } from "react";
import { LISTED_AT_HOST } from "@/lib/business-listing-form";

/** One part of an address between slashes: placeholder text until it is chosen; `fixed` parts never change. */
export interface AddressSegment {
  readonly part: string;
  readonly text: string;
  readonly chosen: boolean;
}

interface ListingAddressLineProps {
  readonly segments: readonly AddressSegment[];
  /** The part being asked for right now, picked out in the accent colour. */
  readonly active?: string | null;
}

function segmentClass(segment: AddressSegment, active: boolean): string {
  if (segment.part === "fixed") return "text-ink-soft";
  if (segment.chosen) return "font-semibold text-ink";
  // Not chosen yet: a placeholder word, dotted so it reads as a blank to fill.
  return `underline decoration-dotted underline-offset-[0.35em] ${active ? "text-accent" : "text-ink-soft/80"}`;
}

/**
 * An address on Firstfold Local, part by part, such as the page a business is listed on,
 * `firstfold.io/in/mh/<district>/<area>/<category>`. Chosen parts are in ink, the parts still to pick are dotted
 * placeholders, so the owner watches the address fill in.
 */
export function ListingAddressLine({ segments, active = null }: ListingAddressLineProps): ReactElement {
  return (
    <p className="font-mono text-[0.9375rem] leading-relaxed [overflow-wrap:anywhere] sm:text-base">
      <span className="text-ink-soft">{LISTED_AT_HOST}</span>
      {segments.map((segment, index) => (
        // The parts never reorder, and "fixed" appears more than once, so the position is the key.
        <Fragment key={index}>
          <span className="text-ink-soft/80">/</span>
          <wbr />
          <span className={segmentClass(segment, segment.part === active)}>{segment.text}</span>
        </Fragment>
      ))}
    </p>
  );
}
