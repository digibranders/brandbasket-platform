import { notFound } from "next/navigation";
import type { ReactElement, ReactNode } from "react";
import { adminBrand } from "@/lib/brand";

/**
 * Wraps the console sections that belong to the public directory and what is sold on it (listings, places, ads, deals).
 * A deployment that does not run the directory (Brandbasket) answers them as pages that do not exist, so they are switched
 * off, not just left out of the dock.
 */
export function DirectoryOnly({ children, directory = adminBrand().sellsDirectory }: { readonly children: ReactNode; readonly directory?: boolean }): ReactElement {
  if (!directory) notFound();
  return <>{children}</>;
}
