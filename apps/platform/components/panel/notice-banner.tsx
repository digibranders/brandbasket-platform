import type { ReactElement } from "react";

/** One line saying what just happened on a page: green for good news, the warm wash for a problem. The words say which. */
export function NoticeBanner({ ok, text }: { readonly ok: boolean; readonly text: string }): ReactElement {
  return (
    <p role="status" className={`rounded-lg px-4 py-3 text-sm ${ok ? "bg-sage-wash text-sage-deep" : "bg-rattan-wash text-rattan-ink"}`}>
      {text}
    </p>
  );
}
