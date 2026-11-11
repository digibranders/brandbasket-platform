import type { ReactNode, Ref } from "react";
import { Icon } from "@/ui";

export interface SectionProps {
  readonly title: string;
  /** "Where this appears": what the section feeds, in a few words. */
  readonly where: string;
  /** Lets a list that removes rows hand focus back to its heading. */
  readonly titleRef?: Ref<HTMLHeadingElement>;
  readonly children: ReactNode;
}

/** One group of the Business profile: the title and where it appears on the left, the fields on the right (phones stack them). */
export function Section({ title, where, titleRef, children }: SectionProps) {
  return (
    <div className="grid gap-4 border-b border-border-subtle p-4 last:border-b-0 md:grid-cols-3 md:gap-6">
      {/* Stays in view under the top bar while its fields scroll past (desktop). */}
      <div className="md:sticky md:top-topbar md:col-span-1 md:-mt-4 md:self-start md:pt-4">
        <h3 ref={titleRef} tabIndex={titleRef === undefined ? undefined : -1} className="type-sub outline-none">
          {title}
        </h3>
        <p className="mt-1 flex items-center gap-1.5 type-meta">
          <Icon name="Globe" size="sm" />
          {where}
        </p>
      </div>
      <div className="flex flex-col gap-4 md:col-span-2">{children}</div>
    </div>
  );
}
