import type { ReactElement, ReactNode } from "react";
import { ChevronDownIcon } from "@fynix/shared/ui/icons";

interface StageDisclosureProps {
  readonly summary: string;
  readonly children: ReactNode;
  /** Open by default so existing content stays visible; the chevron only adds the option to collapse it. */
  readonly defaultOpen?: boolean;
}

/**
 * A collapsible block nested under one timeline stage, using a plain `<details>`/`<summary>`: no client component
 * or state needed, and it stays fully usable without JavaScript.
 */
export function StageDisclosure({ summary, children, defaultOpen = true }: StageDisclosureProps): ReactElement {
  return (
    <details open={defaultOpen} className="group mt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-serif text-xl leading-tight marker:content-none [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon className="size-4 shrink-0 text-ink-soft transition-transform duration-300 ease-calm group-open:rotate-180" />
        {summary}
      </summary>
      <div className="mt-4 pl-6">{children}</div>
    </details>
  );
}
