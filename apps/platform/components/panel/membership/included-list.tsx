import type { ReactElement } from "react";
import type { IncludedIcon, IncludedItem } from "@/lib/checkout-included";

/** One small line icon, drawn here so no icon font or image file is needed. Decorative: the words beside it say the same. */
function Glyph({ icon }: { readonly icon: IncludedIcon }): ReactElement {
  if (icon === "chatbot") {
    // The chatbot's own mark: a heavy open ring, drawn solid because it is a logo, not a line icon.
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.125rem] shrink-0 text-ink">
        <path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c2.6 0 4.5-.9 6-2.6l-2.7-2.3a4.6 4.6 0 0 1-3.3 1.4 4.9 4.9 0 1 1 0-9.8c1.3 0 2.4.5 3.3 1.4L18 5.8a8.4 8.4 0 0 0-6-2.6Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-[1.125rem] shrink-0 text-gold-deep"
    >
      {PATHS[icon]}
    </svg>
  );
}

const PATHS: Readonly<Record<Exclude<IncludedIcon, "chatbot">, ReactElement>> = {
  design: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  pages: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 12h6M9 16h6" />
    </>
  ),
  mobile: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </>
  ),
  enquiries: <path d="M5 4h3.5l1.6 4-2 1.4a11 11 0 0 0 5.5 5.5l1.4-2 4 1.6V18a2 2 0 0 1-2 2A14 14 0 0 1 3 6a2 2 0 0 1 2-2Z" />,
  "local-seo": (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  security: <path d="M12 3 5 6v5.5c0 4.3 2.9 8 7 9.5 4.1-1.5 7-5.2 7-9.5V6z" />,
  performance: <path d="M6 20V12M12 20V5M18 20v-5" />,
  hosting: (
    <>
      <rect x="4" y="4" width="16" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="16" height="6.5" rx="1.5" />
      <path d="M8 7.25h.01M8 16.75h.01" />
    </>
  ),
  updates: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M18.7 5.3l-1.9 1.9M7.2 16.8l-1.9 1.9" />
    </>
  ),
  report: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4M9 17v-3M12 17v-5M15 17v-2" />
    </>
  ),
};

/** A short list of what a part of the payment includes, an icon before each line. */
export function IncludedList({ items }: { readonly items: readonly IncludedItem[] }): ReactElement {
  return (
    <ul className="mt-2 space-y-2.5">
      {items.map((item) => (
        <li key={item.icon} className="flex items-center gap-3 text-sm text-ink">
          <Glyph icon={item.icon} />
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
