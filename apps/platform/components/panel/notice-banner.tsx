import type { ReactElement } from "react";

/** One line saying what just happened on a page: plain for good news, accent for a problem. */
export function NoticeBanner({ ok, text }: { readonly ok: boolean; readonly text: string }): ReactElement {
  return (
    <p
      role="status"
      className={`mt-6 rounded-control px-4 py-3 text-sm ${ok ? "bg-paper-deep text-ink" : "bg-accent-pale text-accent-deep"}`}
    >
      {text}
    </p>
  );
}
