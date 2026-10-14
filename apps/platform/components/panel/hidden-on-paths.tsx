"use client";

import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

interface HiddenOnPathsProps {
  /** Exact paths where the children are left out, because that page shows them itself. */
  readonly paths: readonly string[];
  readonly children: ReactNode;
}

/** Renders its children everywhere except the listed pages. */
export function HiddenOnPaths({ paths, children }: HiddenOnPathsProps): ReactElement | null {
  const pathname = usePathname();
  return paths.includes(pathname) ? null : <>{children}</>;
}
