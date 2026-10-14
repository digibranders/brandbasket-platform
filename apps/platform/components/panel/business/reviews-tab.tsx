import type { ReactElement } from "react";
import { ArrowIcon } from "@fynix/shared/ui/icons";
import { ButtonLink } from "@fynix/shared/ui/panel/button";
import { profileHref } from "@/lib/business-profile-notices";
import type { ProfileTabId } from "@/lib/business-profile";

interface ReviewsTabProps {
  readonly next: { readonly id: ProfileTabId; readonly label: string } | null;
}

interface ReviewPart {
  readonly name: string;
  readonly text: string;
  /** Whether visitors can use it today. */
  readonly live: boolean;
}

/** The sheet's Reviews section, part by part. Nothing here is typed in: reviews come from visitors. */
const PARTS: readonly ReviewPart[] = [
  { name: "Reviews", text: "Visitors write about you on your page. Each review is confirmed with a code.", live: true },
  { name: "Ratings", text: "Your stars are the average of those reviews.", live: true },
  { name: "Business responses", text: "After someone calls you from your page, we ask them whether they spoke with you.", live: false },
  { name: "Customer photos", text: "Reviewers add photos of your work.", live: false },
  { name: "Review verification", text: "Reviews from people who did speak with you are marked as verified.", live: false },
];

/**
 * The Reviews tab: how reviews work for the business. They come from visitors, so there is nothing to fill in; each part
 * says whether it is live. The parts not live yet are marked, not hidden.
 */
export function ReviewsTab({ next }: ReviewsTabProps): ReactElement {
  return (
    <div className="mt-8 max-w-2xl">
      <p className="text-sm text-ink-soft">Reviews come from your visitors, so there is nothing to fill in here.</p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {PARTS.map((part) => (
          <li key={part.name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
            <div className="min-w-0 max-w-md">
              <p className="text-[0.9375rem] font-medium">{part.name}</p>
              <p className="mt-0.5 text-sm text-ink-soft">{part.text}</p>
            </div>
            <span className={`text-sm ${part.live ? "font-medium text-accent" : "text-ink-soft"}`}>{part.live ? "Live" : "Not live yet"}</span>
          </li>
        ))}
      </ul>

      {next === null ? null : (
        <div className="mt-12">
          <ButtonLink href={profileHref(next.id)} variant="secondary">
            Next: {next.label}
            <ArrowIcon className="size-4" />
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
