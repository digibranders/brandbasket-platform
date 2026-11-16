"use client";

import { useEffect, useState, type CSSProperties, type ReactElement } from "react";

/** A number from 0 up to 1 that is always the same for the same two inputs: the letters scatter the same way every time, and rendering stays pure. */
const unit = (index: number, salt: number): number => {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * The words of a rejected topic, each letter on its own with a line through it. When `splash` turns on, every letter breaks away on its own
 * path, tilting and falling outwards as it fades, a little after its neighbour, so the words scatter like a splash.
 */
export function SplashText({ text, splash }: { readonly text: string; readonly splash: boolean }): ReactElement {
  const words = text.split(" ");
  let index = 0;
  return (
    <span aria-label={text}>
      {words.map((word, wordIndex) => (
        <span key={`${word}-${String(wordIndex)}`} aria-hidden="true">
          <span className="inline-block whitespace-nowrap">
            {[...word].map((letter) => {
              const at = index++;
              const delay = Math.round(unit(at, 4) * 380);
              const style: CSSProperties | undefined = splash
                ? {
                    transform: `translate(${String(Math.round((unit(at, 1) - 0.5) * 90))}px, ${String(Math.round(70 + unit(at, 2) * 90))}px) rotate(${String(Math.round((unit(at, 3) - 0.5) * 160))}deg)`,
                    opacity: 0,
                    transition: `transform 850ms cubic-bezier(0.35, 0, 0.9, 0.6) ${String(delay)}ms, opacity 700ms ease-in ${String(delay + 120)}ms`,
                  }
                : undefined;
              return (
                <span key={at} className="inline-block line-through" style={style}>
                  {letter}
                </span>
              );
            })}
          </span>
          {wordIndex < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

/** One line of the reel: as tall as the window, so the window shows exactly one. */
const LINE_REM = 2.25;
const LANDING_LINES = 5;

/**
 * The reel under a rejected topic while a new one is written: lines roll past like a slot machine, and with no words about it. Once the new topic
 * has arrived (`arrived`), the reel slows and stops on it. It rolls through the other topics of the week and a few stand-ins.
 */
export function TopicReel({ lines, arrived }: { readonly lines: readonly string[]; readonly arrived: string | null }): ReactElement {
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (arrived === null) {
      setGo(false);
      return undefined;
    }
    const frame = requestAnimationFrame(() => setGo(true));
    return () => cancelAnimationFrame(frame);
  }, [arrived]);

  const rolling = lines.length === 0 ? ["…"] : lines;
  const lineClass = "h-9 truncate text-[0.8125rem] leading-9 text-ink-2";
  // `w-0 min-w-full`: the window takes the width of its card and never the width of the longest line, so the card keeps its column.
  const window = "h-9 w-0 min-w-full overflow-hidden border-y border-line";
  return (
    <div role="status" className={window}>
      <span className="sr-only">Writing a new topic for this day</span>
      {arrived === null ? (
        <div aria-hidden="true" className="animate-reel-spin" style={{ "--reel-loop": `${String(rolling.length * LINE_REM)}rem`, "--reel-time": `${String(Math.max(1, rolling.length) * 0.12)}s` } as CSSProperties}>
          {[...rolling, ...rolling].map((line, at) => (
            <div key={at} className={lineClass}>
              {line}
            </div>
          ))}
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="motion-reduce:!transition-none"
          style={{ transform: go ? `translateY(-${String(LANDING_LINES * LINE_REM)}rem)` : "translateY(0)", transition: "transform 900ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        >
          {[...Array.from({ length: LANDING_LINES }, (_, at) => rolling[at % rolling.length] ?? "…"), arrived].map((line, at) => (
            <div key={at} className={at === LANDING_LINES ? "h-9 truncate text-[0.8125rem] font-semibold leading-9 text-ink" : lineClass}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
