"use client";

import { getImageProps } from "next/image";
import { useEffect, useId, useState, type CSSProperties, type ReactElement, type RefObject } from "react";
import parts from "./welcome-art-parts.json";
import styles from "./welcome-celebration.module.css";

interface WelcomeCelebrationProps {
  readonly artwork: RefObject<HTMLDivElement | null>;
  readonly className: string;
}

// Every clipped piece shares one optimized image request and decoded texture. Geometry follows the source alpha
// contours, so the approved artwork remains intact while the lid, box, ribbons and individual paper move separately.
const source = getImageProps({ src: "/illustrations/welcome-celebration.png", alt: "", width: 512, height: 342 }).props.src;

function movementOf(kind: string): string {
  switch (kind) {
    case "box": return styles.box;
    case "lid": return styles.lid;
    case "ribbon": return styles.ribbon;
    case "spark": return styles.spark;
    default: return styles.paper;
  }
}

export function WelcomeCelebration({ artwork, className }: WelcomeCelebrationProps): ReactElement {
  const prefix = useId().replaceAll(":", "");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // A cached SVG image can finish before React hydrates and attaches its load handler.
    const texture = new window.Image();
    let active = true;
    const loaded = (): void => { if (active) setReady(true); };
    texture.addEventListener("load", loaded);
    texture.src = source;
    if (texture.complete && texture.naturalWidth > 0) queueMicrotask(loaded);
    return () => {
      active = false;
      texture.removeEventListener("load", loaded);
    };
  }, []);
  return (
    <div ref={artwork} aria-hidden="true" className={className}>
      <svg viewBox="0 0 1536 1024" className={styles.scene} data-ready={ready} focusable="false">
        <defs>
          <image id={`${prefix}-texture`} href={source} width="1536" height="1024" onLoad={() => setReady(true)} />
          {parts.map((part) => (
            <clipPath key={part.id} id={`${prefix}-piece-${String(part.id)}`} clipPathUnits="userSpaceOnUse">
              <polygon points={part.points} />
            </clipPath>
          ))}
        </defs>
        {parts.map((part) => {
          const movement = movementOf(part.kind);
          const properties = {
            transformOrigin: `${String(part.cx)}px ${String(part.cy)}px`,
            "--piece-duration": `${String(2.8 + (part.id % 7) * 0.3)}s`,
            "--piece-delay": `${String(1100 + (part.id % 8) * 90)}ms`,
            "--entry-delay": `${String(180 + (part.id % 6) * 65)}ms`,
            "--drift-x": `${String((part.id % 2 === 0 ? -1 : 1) * (12 + part.id % 15))}px`,
            "--drift-y": `${String(-20 - (part.id % 5) * 9)}px`,
            "--twist": `${String(part.id % 2 === 0 ? -16 : 18)}deg`,
          } as CSSProperties;
          return (
            <g key={part.id} data-part={part.kind} className={`${styles.enter} ${movement}`} style={properties}>
              <g className={`${styles.float} ${movement}`} style={properties}>
                <g clipPath={`url(#${prefix}-piece-${String(part.id)})`}>
                  <use href={`#${prefix}-texture`} />
                </g>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
