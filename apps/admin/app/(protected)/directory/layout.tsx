import type { ReactElement, ReactNode } from "react";
import { DirectoryOnly } from "@/components/console/directory-only";

export default function DirectorySectionLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return <DirectoryOnly>{children}</DirectoryOnly>;
}
