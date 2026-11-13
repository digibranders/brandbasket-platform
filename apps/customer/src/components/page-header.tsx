import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/ui";

export interface PageHeaderProps {
  /** The page's one h1. */
  readonly title: ReactNode;
  /** One meta line under the title. No help paragraph (plan 60, PageHeader). */
  readonly description?: ReactNode;
  /** On the right: one primary action at most. Full width on phones. */
  readonly actions?: ReactNode;
  /** The page's TabLinks, under the title. */
  readonly tabs?: ReactNode;
  /** Detail pages: the list they belong to (plan 60, section 9, Detail template). */
  readonly back?: { readonly href: string; readonly label: string };
}

export function PageHeader({ title, description, actions, tabs, back }: PageHeaderProps) {
  return (
    <header className="mb-4 flex flex-col gap-4">
      {back === undefined ? null : (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1.5 type-meta no-underline hover:text-ink">
          <Icon name="ArrowLeft" size="sm" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-60 flex-1">
          <h1 className="type-title">{title}</h1>
          {description === undefined ? null : <p className="mt-0.5 type-meta">{description}</p>}
        </div>
        {actions === undefined ? null : <div className="flex w-full flex-wrap items-center gap-2 md:w-auto">{actions}</div>}
      </div>
      {tabs}
    </header>
  );
}
