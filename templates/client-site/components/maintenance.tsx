import type { CSSProperties } from "react";
import { BuilderBody, BuilderHead } from "./builder";

interface MaintenanceProps {
  /** The business's name: makes the headline "Riverside Dental is taking a short break". */
  readonly businessName?: string;
}

const COLOURS = { ink: "#0c1e2e", paper: "#f6f1ec", soft: "#4b5b67", accent: "#c8754a" } as const;

/**
 * One seven-second loop: he types with his eyes on the screen, glances up at you for a moment (his head lifts a little),
 * then goes back to typing. Everything is still for visitors who ask for reduced motion.
 */
const CSS = `
@keyframes fx-spin{to{transform:rotate(360deg)}}
@keyframes fx-eyes{0%,54%{transform:translate(0,1.4px)}60%,80%{transform:translate(-1px,-.6px)}86%,100%{transform:translate(0,1.4px)}}
@keyframes fx-peek{0%,54%{transform:rotate(1deg)}60%,80%{transform:translateY(-3px) rotate(-2.5deg)}86%,100%{transform:rotate(1deg)}}
@keyframes fx-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(1.2px)}}
@keyframes fx-glyph{0%{opacity:0;transform:translateY(6px)}25%{opacity:1}100%{opacity:0;transform:translateY(-18px)}}
.fx-eyes{animation:fx-eyes 7s ease-in-out infinite}
.fx-peek{transform-origin:253px 205px;animation:fx-peek 7s ease-in-out infinite}
.fx-bob{animation:fx-bob .5s ease-in-out infinite}
.fx-gear{transform-box:fill-box;transform-origin:center;animation:fx-spin 5s linear infinite}
.fx-glyph-1{animation:fx-glyph 2.4s infinite}
.fx-glyph-2{animation:fx-glyph 2.4s .8s infinite}
.fx-glyph-3{animation:fx-glyph 2.4s 1.6s infinite}
@media (prefers-reduced-motion:reduce){.fx-eyes,.fx-peek,.fx-bob,.fx-gear,.fx-glyph-1,.fx-glyph-2,.fx-glyph-3{animation:none}.fx-glyph-1,.fx-glyph-2,.fx-glyph-3{opacity:0}}
`;

/**
 * A laptop seen from behind: the back of the screen, slightly wider at the bottom, standing on a thin base with a hinge
 * and a notch to lift the lid. The cog on its back is the "settings" mark, turning slowly.
 */
function Laptop() {
  return (
    <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M140 258L128 224C127 217 131 214 137 214H223C229 214 233 217 234 224L244 258Z" fill="var(--paper)" />
      <rect x="112" y="258" width="148" height="12" rx="5" fill="var(--paper)" />
      <path d="M170 258h32" strokeWidth="2" fill="none" />
      <path d="M176 264h20" strokeWidth="2" fill="none" opacity=".5" />
      <Gear cx={186} cy={238} r={9} className="fx-gear" />
    </g>
  );
}

/** A cog drawn as a ring with teeth, so it reads as a gear at any size. */
function Gear({ cx, cy, r, className }: { readonly cx: number; readonly cy: number; readonly r: number; readonly className: string }) {
  return (
    <g className={className}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={r * 0.45} strokeDasharray={`${r * 0.5} ${r * 0.42}`} />
      <circle cx={cx} cy={cy} r={r * 0.72} fill="var(--paper)" stroke="currentColor" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.22} fill="currentColor" />
    </g>
  );
}

/**
 * Shown in place of the whole website while its plan has ended. No links: nothing else on the site works either.
 * The builder is the same character as the Fynix blog screens, fixing things at his laptop.
 */
export function Maintenance({ businessName }: MaintenanceProps) {
  const headline = businessName === undefined ? "We'll be back soon" : `${businessName} is taking a short break`;

  return (
    <main
      style={{
        "--paper": COLOURS.paper,
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: COLOURS.ink,
        background: COLOURS.paper,
      } as CSSProperties}
    >
      <style>{CSS}</style>
      <div style={{ maxWidth: "30rem" }}>
        <svg viewBox="0 0 420 290" fill="none" aria-hidden="true" focusable="false" style={{ width: "100%", maxWidth: "20rem", height: "auto" }}>
          <BuilderBody />
          <g className="fx-peek">
            <g className="fx-bob">
              <BuilderHead smile gaze="down" animatedEyes />
            </g>
          </g>
          <Laptop />
          <g fontFamily="ui-monospace, Menlo, monospace" fontSize="15" fill={COLOURS.accent}>
            <text className="fx-glyph-1" x="118" y="196">{"</>"}</text>
            <text className="fx-glyph-2" x="146" y="190">{"{ }"}</text>
            <text className="fx-glyph-3" x="170" y="184">{";"}</text>
          </g>
        </svg>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 500, margin: "0.5rem 0 0", textWrap: "balance" }}>{headline}</h1>
        <p style={{ margin: "0.75rem 0 0", lineHeight: 1.6, color: COLOURS.soft, fontFamily: "system-ui, sans-serif" }}>
          We&rsquo;re making a few improvements. Please check back shortly.
        </p>
      </div>
    </main>
  );
}
