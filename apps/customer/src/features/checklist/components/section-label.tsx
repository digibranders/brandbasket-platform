import type { ReactNode } from "react";

/** A small heading that splits a long item into parts. */
export function SectionLabel({ children }: { readonly children: ReactNode }) {
  return <h3 className="type-sub">{children}</h3>;
}
