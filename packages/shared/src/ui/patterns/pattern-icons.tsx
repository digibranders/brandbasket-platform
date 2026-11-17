import type { ReactElement, ReactNode } from "react";

/** The few glyphs the interaction patterns need, drawn on the same 24px line grid as `ui/icons.tsx`. */
function Glyph({ className = "size-[18px]", children }: { readonly className?: string; readonly children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function DotsGlyph(): ReactElement {
  return (
    <Glyph>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Glyph>
  );
}

export function CloseGlyph({ className }: { readonly className?: string }): ReactElement {
  return (
    <Glyph className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Glyph>
  );
}

export function SearchGlyph(): ReactElement {
  return (
    <Glyph>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Glyph>
  );
}

export function PencilGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    </Glyph>
  );
}

export function AlertGlyph(): ReactElement {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v5M12 16.2v.1" />
    </Glyph>
  );
}

export function UndoGlyph(): ReactElement {
  return (
    <Glyph>
      <path d="M9 7 4 12l5 5" />
      <path d="M4 12h10a5 5 0 0 1 0 10" transform="translate(0 -5)" />
    </Glyph>
  );
}
