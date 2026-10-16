/**
 * The Fynix builder: curly hair, round spectacles, an L-shaped nose. The same drawing as the dashboard's blog screens
 * (packages/shared/src/ui/changelog-art.tsx), copied here because a client site shares no build with the platform.
 * Keep the two in step by hand. Drawn in the current text colour; the fills use `--paper` so it sits on any background.
 */
const INK = { stroke: "currentColor", strokeWidth: 2.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const THIN = { stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const PAPER = "var(--paper, #fff)";

export function BuilderHead({
  smile = false,
  gaze = "forward",
  animatedEyes = false,
}: {
  readonly smile?: boolean;
  readonly gaze?: "down" | "forward";
  /** Pupils are wrapped so the caller's CSS (class `fx-eyes`) can move them, e.g. to glance up from a screen. */
  readonly animatedEyes?: boolean;
}) {
  const eyeY = gaze === "down" ? 148.8 : 148;
  const eyeX = gaze === "forward" ? -0.8 : 0;
  return (
    <g>
      <path d="M223 159C224 173 227 186 235 188C243 190 254 189 264 184C273 179 276 172 277 163" fill={PAPER} {...INK} />
      <path d="M276 148C286 146 291 152 289 160C287 166 280 166 277 163" fill={PAPER} {...INK} />
      <path d="M280 153C283 155 283 158 281 160" fill="none" {...THIN} />
      <path
        d="M215 136C206 130 204 118 214 112C209 102 217 92 227 92C231 84 244 82 254 88C262 82 276 85 281 94C290 95 297 106 294 117C300 126 296 138 289 144C286 147 281 150 276 150C273 143 268 135 258 135C250 135 244 140 238 134C230 128 222 135 215 136Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <circle cx="224" cy="148" r="11" fill={PAPER} {...INK} />
      <circle cx="252" cy="148" r="11" fill={PAPER} {...INK} />
      <line x1="235" y1="148" x2="241" y2="148" {...INK} />
      <line x1="263" y1="148" x2="276" y2="150" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M213 148Q216 142 220 137" fill="none" {...THIN} />
      <g className={animatedEyes ? "fx-eyes" : undefined}>
        <circle cx={223.5 + eyeX} cy={eyeY} r="1.8" fill="currentColor" />
        <circle cx={251 + eyeX} cy={eyeY} r="1.8" fill="currentColor" />
      </g>
      <path d="M234 153V166H227" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
      {smile ? <path d="M232 174Q237 178 242 174" fill="none" {...INK} /> : <line x1="233" y1="175" x2="240" y2="175" {...INK} />}
    </g>
  );
}

/**
 * Shoulders, neck and collar: the part that stays still when the head moves. The neck lines run up under the jaw (the
 * face is drawn over them), so a head that lifts or tilts never leaves a gap between chin and collar.
 */
export function BuilderBody() {
  return (
    <>
      <path d="M250 176L253 208M282 170L291 206" fill="none" {...INK} />
      <path d="M253 208C257 226 287 226 295 205" fill="none" {...INK} />
      <path d="M253 208C236 212 221 225 217 242M295 205C310 212 344 233 360 270" fill="none" {...INK} />
    </>
  );
}
