import Link from "next/link";
import type { ReactElement } from "react";
import { ChevronRightIcon } from "@brandbasket/shared/ui/icons";

export function BackLink({ href, label }: { readonly href: string; readonly label: string }): ReactElement {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1.5 text-sm text-ink-soft transition-colors duration-300 ease-calm hover:text-ink"
    >
      <ChevronRightIcon className="size-4 rotate-180 transition-transform duration-300 ease-calm group-hover:-translate-x-0.5" />
      {label}
    </Link>
  );
}
