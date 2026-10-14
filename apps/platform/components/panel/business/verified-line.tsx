import type { ReactElement } from "react";
import { StatusLine } from "@/components/panel/status-line";

/** Verification done: the line the Review tab shows once the business is verified. */
export function VerifiedLine({ since }: { readonly since: string }): ReactElement {
  return <StatusLine tone="done">Verified{since === "" ? null : <span className="font-normal text-ink-soft">{` · since ${since}`}</span>}</StatusLine>;
}
