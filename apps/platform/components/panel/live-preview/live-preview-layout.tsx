"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode, type RefCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "@firstfold/shared/lib/cn";
import {
  PREVIEW_DRAFT_MESSAGE,
  PREVIEW_READY_MESSAGE,
  PREVIEW_SECTION_MESSAGE,
  changedPreviewFields,
  fieldsIn,
  ownerDraft,
  readPreviewFields,
  type PreviewBase,
  type PreviewFields,
  type PreviewSection,
} from "@/lib/preview-draft";
import type { LivePreviewSource } from "@/lib/server/live-preview";

type View = "phone" | "desktop";

/** The width the business's page is drawn at before it is scaled down to fit: a phone, and a screen wide enough for two columns. */
const LOGICAL_WIDTH: Readonly<Record<View, number>> = { phone: 390, desktop: 960 };
/** After the last keystroke, how long before the preview is told: soon enough to feel live, not on every key. */
const SEND_DELAY_MS = 200;

/** From this width (Tailwind's xl) the preview stays beside the forms; below it, it opens over them. */
const WIDE_SCREEN = "(min-width: 80rem)";

/**
 * Whether the screen is wide enough for the preview to sit beside the forms. False until the browser has said, so the
 * page it draws first is the one the server drew.
 */
function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN);
    const update = (): void => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

interface LivePreviewLayoutProps {
  /** Where the preview is drawn; null when the business has no page yet, and the page is shown without one. */
  readonly source: LivePreviewSource | null;
  /**
   * An owner's saved Business profile, read from our database, for the pages whose forms save as they go (Business, Deals):
   * the preview draws it with what is typed on top. Absent for a client's Listing and Your details pages, which send only what
   * has been changed from the page as it loaded.
   */
  readonly base?: PreviewBase | null;
  /** The card of the business's page the form being edited fills: the preview scrolls to it. */
  readonly section?: PreviewSection;
  readonly children: ReactNode;
}

/**
 * A dashboard page with the business's own page beside it, drawn as it will look with what is typed in the forms, before
 * it is saved. On a wide screen a phone-sized preview stays beside the forms; a bar at the bottom of a narrow one, and
 * the Desktop button, open a larger one over them. Each form keeps its own Save: nothing here saves anything.
 */
export function LivePreviewLayout({ source, base = null, section, children }: LivePreviewLayoutProps): ReactElement {
  if (source === null) return <>{children}</>;
  return (
    <WithPreview source={source} base={base} section={section}>
      {children}
    </WithPreview>
  );
}

interface WithPreviewProps {
  readonly source: LivePreviewSource;
  readonly base: PreviewBase | null;
  readonly section: PreviewSection | undefined;
  readonly children: ReactNode;
}

function WithPreview({ source, base, section, children }: WithPreviewProps): ReactElement {
  const formsRef = useRef<HTMLDivElement>(null);
  const frames = useRef(new Set<HTMLIFrameElement>());
  // Which of the website's addresses the frame ended up on (it may have been sent on to www): known once it says it is ready.
  const frameOrigin = useRef<string | null>(null);
  const initialRef = useRef<PreviewFields | null>(null);
  const timerRef = useRef<number | null>(null);
  const baseRef = useRef(base);
  const sectionRef = useRef(section);
  const [open, setOpen] = useState(false);
  const [sheetView, setSheetView] = useState<View>("phone");
  const wide = useWideScreen();

  /** Every preview on the page, the one beside the forms and the one over them, is told what is typed. */
  const attachFrame = useCallback<RefCallback<HTMLIFrameElement>>((frame) => {
    if (frame === null) return undefined;
    frames.current.add(frame);
    return () => {
      frames.current.delete(frame);
    };
  }, []);

  /** Brings the card the tab being edited fills into view in every preview. */
  const showSection = useCallback((): void => {
    const target = sectionRef.current;
    const origin = frameOrigin.current;
    if (target === undefined || origin === null) return;
    for (const frame of frames.current) frame.contentWindow?.postMessage({ type: PREVIEW_SECTION_MESSAGE, section: target }, origin);
  }, []);

  const send = useCallback((): void => {
    const forms = formsRef.current;
    const initial = initialRef.current;
    if (forms === null || initial === null) return;
    const saved = baseRef.current;
    const { value, checked, ticked } = fieldsIn(forms);
    const current = readPreviewFields(value, checked, saved?.ids, ticked);
    const draft = saved === null ? changedPreviewFields(initial, current) : ownerDraft(saved, current);
    const origin = frameOrigin.current;
    if (origin === null) return;
    for (const frame of frames.current) frame.contentWindow?.postMessage({ type: PREVIEW_DRAFT_MESSAGE, draft }, origin);
  }, []);

  const sendSoon = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(send, SEND_DELAY_MS);
  }, [send]);

  useEffect(() => {
    if (formsRef.current !== null) initialRef.current = readPreviewFields(fieldsIn(formsRef.current).value);
    function onMessage(event: MessageEvent<unknown>): void {
      const data = event.data;
      const fromPreview = source.origins.includes(event.origin) && [...frames.current].some((frame) => frame.contentWindow === event.source);
      if (fromPreview && typeof data === "object" && data !== null && "type" in data && data.type === PREVIEW_READY_MESSAGE) {
        frameOrigin.current = event.origin;
        send();
        showSection();
      }
    }
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [send, showSection, source.origins]);

  // A save (or an upload or a removal) makes the page draw again with the profile as our database now has it: the preview
  // follows at once, without waiting for the website to hear of it.
  const baseKey = JSON.stringify(base);
  useEffect(() => {
    baseRef.current = base;
    send();
    // `base` is read through its serialised form: the server draws a fresh object every time, equal or not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, send]);

  // Moving to another tab: the preview goes to that tab's card.
  useEffect(() => {
    sectionRef.current = section;
    showSection();
  }, [section, showSection]);

  const close = useCallback((): void => setOpen(false), []);

  return (
    <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-12">
      {/* A click can change a field without an input event (the hours editor's copy button), so it is watched too. */}
      <div ref={formsRef} onInput={sendSoon} onChange={sendSoon} onClick={sendSoon} className="min-w-0">
        {children}
      </div>

      {wide ? (
        <aside className="sticky top-6 self-start">
          <PreviewPanel
            source={source}
            attachFrame={attachFrame}
            view="phone"
            onView={(view) => {
              // The desktop page needs more room than the column beside the forms has, so it opens over them.
              if (view === "desktop") {
                setSheetView("desktop");
                setOpen(true);
              }
            }}
            sheet={false}
            onClose={close}
          />
        </aside>
      ) : null}

      {/* Over the whole page, not inside the dashboard's own column: the menu beside it would otherwise show through. */}
      {open
        ? createPortal(
            <PreviewPanel source={source} attachFrame={attachFrame} view={sheetView} onView={setSheetView} sheet onClose={close} />,
            document.body,
          )
        : null}

      <div className="sticky bottom-0 z-30 mt-8 border-t border-line bg-paper py-3 xl:hidden">
        <button
          type="button"
          onClick={() => {
            setSheetView("phone");
            setOpen(true);
          }}
          className="rounded-full border border-ink/40 px-5 py-2 text-sm font-semibold transition-colors duration-300 ease-calm hover:border-ink"
        >
          Preview
        </button>
      </div>
    </div>
  );
}

interface PreviewPanelProps {
  readonly source: LivePreviewSource;
  readonly attachFrame: RefCallback<HTMLIFrameElement>;
  readonly view: View;
  readonly onView: (view: View) => void;
  /** Drawn over the whole page, with a way back to the forms, instead of beside them. */
  readonly sheet: boolean;
  readonly onClose: () => void;
}

function PreviewPanel({ source, attachFrame, view, onView, sheet, onClose }: PreviewPanelProps): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const observer = new ResizeObserver(() => setSize({ width: stage.clientWidth, height: stage.clientHeight }));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sheet) return;
    const scrolled = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = scrolled;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet, onClose]);

  const logical = LOGICAL_WIDTH[view];
  const scale = size.width === 0 ? 1 : Math.min(1, size.width / logical);

  return (
    <div className={cn("flex flex-col gap-3", sheet && "fixed inset-0 z-[100] bg-paper p-4")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-soft">Preview</p>
        <div className="flex items-center gap-4">
          <div role="group" aria-label="Preview size" className="inline-flex rounded-full border border-line p-0.5 text-xs font-semibold">
            {(["phone", "desktop"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => onView(option)}
                className={cn(
                  "rounded-full px-3 py-1 capitalize transition-colors duration-300 ease-calm",
                  view === option ? "bg-ink text-paper" : "text-ink-soft hover:text-ink",
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {sheet ? (
            <button type="button" onClick={onClose} className="link-underline text-sm font-semibold">
              Back to editing
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={stageRef}
        className={cn("relative overflow-hidden rounded-xl border border-line bg-white", sheet ? "min-h-0 flex-1" : "h-[calc(100dvh-9rem)]")}
      >
        <iframe
          ref={attachFrame}
          src={source.src}
          title="How your business page looks"
          // Its own origin, its own scripts, nothing more: no pop-ups, no forms sent, no navigating this page away.
          sandbox="allow-scripts allow-same-origin"
          className="absolute top-0 border-0 bg-white"
          style={{
            width: logical,
            height: size.height / scale,
            transform: `scale(${String(scale)})`,
            transformOrigin: "0 0",
            // Centred when the page is drawn narrower than the panel.
            left: Math.max(0, (size.width - logical * scale) / 2),
          }}
        />
      </div>
    </div>
  );
}
