import type { ReactElement, ReactNode } from "react";

/**
 * Small stroke glyphs for the post editor's toolbar and sidebar. Kept beside the editor rather than in the shared
 * icon set: nothing else in either dashboard formats text.
 */
interface GlyphProps {
  readonly className?: string;
}

function Glyph({ className, children }: GlyphProps & { readonly children: ReactNode }): ReactElement {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className ?? "size-4"}
    >
      {children}
    </svg>
  );
}

export function UndoGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M5.5 4 2.5 7l3 3" />
      <path d="M2.5 7h7a4 4 0 0 1 0 8H8" />
    </Glyph>
  );
}

export function RedoGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M10.5 4l3 3-3 3" />
      <path d="M13.5 7h-7a4 4 0 0 0 0 8H8" />
    </Glyph>
  );
}

export function BulletListGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M6 4h8M6 8h8M6 12h8" />
      <circle cx="2.8" cy="4" r=".6" fill="currentColor" />
      <circle cx="2.8" cy="8" r=".6" fill="currentColor" />
      <circle cx="2.8" cy="12" r=".6" fill="currentColor" />
    </Glyph>
  );
}

export function NumberListGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5" />
      <path d="M2.2 2.8 3.2 2.3v3.2M2.2 9.4c.2-.4.6-.6 1-.6.5 0 .9.3.9.8 0 .8-1.9 1.2-1.9 2.4h2" />
    </Glyph>
  );
}

export function QuoteGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M3 4v8M6 5.5h7M6 8h7M6 10.5h4.5" />
    </Glyph>
  );
}

export function DividerGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M2 8h12" />
      <path d="M4 4.5h8M4 11.5h8" opacity={0.45} />
    </Glyph>
  );
}

export function LinkGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.8.8" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.5 8.8a2.6 2.6 0 0 0 3.7 3.7l.8-.8" />
    </Glyph>
  );
}

export function ExpandGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
    </Glyph>
  );
}

export function CollapseGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5" />
    </Glyph>
  );
}

export function ExternalGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5" />
      <path d="M12 9.5v2.7c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3V5.3c0-.7.6-1.3 1.3-1.3h2.7" />
    </Glyph>
  );
}

export function CaretGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" />
    </Glyph>
  );
}

export function DotsGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <circle cx="3.5" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r=".9" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function CheckGlyph(props: GlyphProps): ReactElement {
  return (
    <Glyph {...props}>
      <path d="m3.5 8.5 3 3 6-7" />
    </Glyph>
  );
}
