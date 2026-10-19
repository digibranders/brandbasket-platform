import type { ReactElement } from "react";
import { maskPhone } from "@brandbasket/shared/server/phone-display";

/**
 * A number hidden but for its country code and last three digits, with no call link: for a list where staff have no reason
 * to ring the person (a reviewer or commenter). Where they do, the number is on the record's own page.
 */
export function MaskedPhone({ phone }: { readonly phone: string | null }): ReactElement {
  if (phone === null) return <span className="text-ink-soft">Number erased</span>;
  return <span className="tabular-nums">{maskPhone(phone)}</span>;
}
