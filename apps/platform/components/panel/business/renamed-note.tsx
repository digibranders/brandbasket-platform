import type { ReactElement } from "react";
import { profileHref } from "@/lib/business-profile-notices";

/** Says what the owner called this tab on their page, and where to change it. Shown only once they have named it. */
export function RenamedNote({ label }: { readonly label: string }): ReactElement {
  return (
    <p className="mt-1 text-sm text-ink-soft">
      On your page this tab is called <strong className="font-semibold text-ink">{label}</strong>.{" "}
      <a href={profileHref("page-tabs")} className="font-medium text-accent hover:underline">
        Change the name
      </a>
    </p>
  );
}
