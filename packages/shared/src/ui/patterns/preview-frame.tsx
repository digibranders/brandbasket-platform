import type { ReactElement, ReactNode } from "react";

export interface PreviewFrameProps {
  readonly url: string;
  readonly children?: ReactNode;
  readonly caption?: string;
  readonly className?: string;
}

/**
 * PreviewFrame: framed browser preview of the real site.
 * 16:10 aspect ratio, 14px radius, soft elevated shadow with a caption row.
 */
export function PreviewFrame({
  url,
  children,
  caption,
  className = "",
}: PreviewFrameProps): ReactElement {
  return (
    <figure className={`flex flex-col gap-2 ${className}`}>
      <div className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-hero">
        <div className="flex h-10 items-center gap-2 border-b border-border bg-surface px-3.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
            <span className="h-2.5 w-2.5 rounded-full bg-border" />
          </div>
          <div className="mx-auto flex h-6 w-full max-w-[340px] items-center justify-center rounded-[6px] border border-border bg-canvas px-3 font-mono text-xs text-ink-2">
            <span className="truncate">{url}</span>
          </div>
        </div>
        <div className="relative flex flex-1 items-center justify-center overflow-auto bg-[#FAF9F6] p-6 text-center">
          {children}
        </div>
      </div>
      {caption ? (
        <figcaption className="text-center font-sans text-xs text-ink-3">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
