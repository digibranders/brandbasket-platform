import type { ReactElement, SVGProps } from "react";
import { cn } from "../lib/cn";

export interface ChangelogArtProps extends SVGProps<SVGSVGElement> {
  /** Matches an entry's id in content/changelog.ts. */
  readonly entry: string;
  readonly className?: string;
}

/**
 * Standard stroke and line styles matching the handcrafted builder aesthetic.
 */
const INK = {
  stroke: "currentColor",
  strokeWidth: 2.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const INK_THIN = {
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CARD_FILL = "var(--color-card, #ffffff)";

/**
 * The signature head of the builder: curly dark hair, round spectacles,
 * angular L-shaped nose, mouth line, ear with cartilage, neck, and crewneck collar.
 *
 * Drawn identically across every changelog date so the builder is recognizably
 * the exact same person in every release note.
 */
function BuilderHead({
  eyeGaze = "down",
  smile = false,
}: {
  readonly eyeGaze?: "down" | "forward" | "up";
  readonly smile?: boolean;
}): ReactElement {
  const eyeOffsetY = eyeGaze === "down" ? 0.8 : eyeGaze === "up" ? -1.2 : 0;
  const eyeOffsetX = eyeGaze === "forward" ? -0.8 : 0;

  return (
    <g id="builder-head">
      {/* Face & Jawline */}
      <path
        d="M 223 159 C 224 173 227 186 235 188 C 243 190 254 189 264 184 C 273 179 276 172 277 163"
        fill={CARD_FILL}
        {...INK}
      />

      {/* Ear on the right */}
      <path
        d="M 276 148 C 286 146 291 152 289 160 C 287 166 280 166 277 163"
        fill={CARD_FILL}
        {...INK}
      />
      {/* Ear inner cartilage detail */}
      <path d="M 280 153 C 283 155 283 158 281 160" fill="none" {...INK_THIN} />

      {/* Neck lines */}
      <path d="M 251 189 L 253 208" fill="none" {...INK} />
      <path d="M 285 181 L 291 206" fill="none" {...INK} />

      {/* Crewneck collar curve */}
      <path d="M 253 208 C 257 226 287 226 295 205" fill="none" {...INK} />

      {/* Curly hair: handcrafted cloud of curls */}
      <path
        d="M 215 136 
           C 206 130 204 118 214 112
           C 209 102 217 92 227 92
           C 231 84 244 82 254 88
           C 262 82 276 85 281 94
           C 290 95 297 106 294 117
           C 300 126 296 138 289 144
           C 286 147 281 150 276 150
           C 273 143 268 135 258 135
           C 250 135 244 140 238 134
           C 230 128 222 135 215 136 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
      />

      {/* Glasses */}
      {/* Left lens */}
      <circle cx="224" cy="148" r="11" fill={CARD_FILL} {...INK} />
      {/* Right lens */}
      <circle cx="252" cy="148" r="11" fill={CARD_FILL} {...INK} />
      {/* Bridge connecting lenses */}
      <line x1="235" y1="148" x2="241" y2="148" {...INK} />
      {/* Right frame temple arm to ear */}
      <line x1="263" y1="148" x2="276" y2="150" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      {/* Left frame temple edge */}
      <path d="M 213 148 Q 216 142 220 137" fill="none" {...INK_THIN} />

      {/* Eyes / Pupils with configurable focus */}
      <circle cx={223.5 + eyeOffsetX} cy={148 + eyeOffsetY} r="1.8" fill="currentColor" />
      <circle cx={251 + eyeOffsetX} cy={148 + eyeOffsetY} r="1.8" fill="currentColor" />

      {/* Nose (clean L-shaped line) */}
      <path d="M 234 153 V 166 H 227" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="miter" />

      {/* Mouth line */}
      {smile ? (
        <path d="M 232 174 Q 237 178 242 174" fill="none" {...INK} />
      ) : (
        <line x1="233" y1="175" x2="240" y2="175" {...INK} />
      )}
    </g>
  );
}

/**
 * The signature body lines of the builder.
 * Exactly two smooth, purposeful curves with ZERO overlapping or intersecting strokes:
 * 1. Left shoulder curving naturally downward from the collar.
 * 2. Right shoulder & back curving smoothly down to the base.
 */
function BuilderBody(): ReactElement {
  return (
    <g id="builder-body">
      {/* Left Shoulder */}
      <path d="M 253 208 C 236 212 221 225 217 242" fill="none" {...INK} />
      {/* Right Shoulder & Body */}
      <path d="M 295 205 C 310 212 344 233 360 270" fill="none" {...INK} />
    </g>
  );
}

/**
 * The signature dashed curlicue thought loop floating above the builder.
 */
function DashedThoughtLoop({ className = "opacity-75" }: { readonly className?: string }): ReactElement {
  return (
    <g className={className}>
      <path
        d="M 298 103 C 322 76 368 76 384 104 C 395 124 394 145 378 155 C 360 166 348 152 355 137 C 363 120 380 128 385 146 C 390 174 374 206 363 222"
        fill="none"
        strokeDasharray="5 5"
        {...INK_THIN}
      />
    </g>
  );
}

/* =========================================================================
   SCENE 1: CHAT ("Someone to ask, on every page")
   The builder engages with live floating speech dialog bubbles rising
   from their laptop screen, answering questions in real-time.
   ========================================================================= */
function ChatScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="forward" smile={true} />

      {/* Laptop base & lid (sitting in front of left shoulder) */}
      <path
        d="M 134 270 L 123 222 C 122 216 126 214 132 214 L 227 214 C 233 214 236 217 237 222 L 247 270 Z"
        fill={CARD_FILL}
        {...INK}
      />
      <circle cx="185" cy="245" r="7" fill="none" {...INK_THIN} />

      {/* Radiating light rays from laptop screen */}
      <line x1="120" y1="202" x2="105" y2="195" {...INK} />
      <line x1="130" y1="188" x2="116" y2="173" {...INK} />

      {/* Chat dialogue blooming cleanly above the screen */}
      {/* 1. Incoming Visitor Chat Bubble */}
      <g>
        <rect x="42" y="104" width="118" height="42" rx="10" fill={CARD_FILL} {...INK} />
        {/* Chat speech bubble tail pointing left */}
        <path d="M 52 146 L 44 156 L 62 146 Z" fill={CARD_FILL} {...INK} />
        {/* Visitor message text lines */}
        <line x1="58" y1="120" x2="136" y2="120" {...INK_THIN} />
        <line x1="58" y1="132" x2="108" y2="132" {...INK_THIN} />
      </g>

      {/* 2. Builder Instant Response Bubble */}
      <g>
        <rect x="100" y="156" width="104" height="38" rx="10" fill={CARD_FILL} {...INK} />
        {/* Speech tail pointing towards builder */}
        <path d="M 182 194 L 194 204 L 188 194 Z" fill={CARD_FILL} {...INK} />
        {/* Quick reply typing dots */}
        <circle cx="132" cy="175" r="3" fill="currentColor" />
        <circle cx="146" cy="175" r="3" fill="currentColor" />
        <circle cx="160" cy="175" r="3" fill="currentColor" />
      </g>
    </g>
  );
}

/* =========================================================================
   SCENE 2: STACK ("What's included, laid out properly")
   The builder inspects and meticulously balances a floating isometric
   architectural stack of website layers (the 8 tiers of a complete site).
   ========================================================================= */
function StackScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="down" />

      {/* 3D Isometric Architectural Layers of the Website floating freely and cleanly */}
      {/* Layer 1 (Base tier: Hosting & Monitoring) */}
      <g>
        <path d="M 70 248 L 130 264 L 190 248 L 130 232 Z" fill={CARD_FILL} {...INK} />
        <path d="M 70 248 L 70 255 L 130 271 L 190 255 L 190 248" fill={CARD_FILL} {...INK} />
        <line x1="130" y1="264" x2="130" y2="271" {...INK} />
      </g>

      {/* Layer 2 (Middle tier: CMS & Infrastructure) */}
      <g>
        <path d="M 66 216 L 126 232 L 186 216 L 126 200 Z" fill={CARD_FILL} {...INK} />
        <path d="M 66 216 L 66 223 L 126 239 L 186 223 L 186 216" fill={CARD_FILL} {...INK} />
        <line x1="126" y1="232" x2="126" y2="239" {...INK} />
      </g>

      {/* Layer 3 (Upper tier: Modern Framework & Performance) */}
      <g>
        <path d="M 72 184 L 132 200 L 192 184 L 132 168 Z" fill={CARD_FILL} {...INK} />
        <path d="M 72 184 L 72 191 L 132 207 L 192 191 L 192 184" fill={CARD_FILL} {...INK} />
        <line x1="132" y1="200" x2="132" y2="207" {...INK} />
      </g>

      {/* Layer 4 (Top tier: The Brandbasket & Visual Interface) */}
      <g>
        <path d="M 68 150 L 128 166 L 188 150 L 128 134 Z" fill={CARD_FILL} {...INK} />
        <path d="M 68 150 L 68 157 L 128 173 L 188 157 L 188 150" fill={CARD_FILL} {...INK} />
        <line x1="128" y1="166" x2="128" y2="173" {...INK} />
        {/* Wireframe UI elements on top layer */}
        <circle cx="128" cy="146" r="3.5" fill="none" {...INK_THIN} />
      </g>
    </g>
  );
}

/* =========================================================================
   SCENE 3: NAME ("We're Brandbasket now")
   The builder proudly holds an origami paper-fold banner
   marking the new name and address: Brandbasket / brandbasket.in.
   ========================================================================= */
function NameScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="forward" smile={true} />

      {/* Geometric Brandbasket Paper Plaque & Name Banner */}
      <g>
        {/* Main Banner body */}
        <path
          d="M 54 130 L 186 130 C 192 130 196 134 196 140 L 196 200 C 196 206 192 210 186 210 L 54 210 C 48 210 44 206 44 200 L 44 140 C 44 134 48 130 54 130 Z"
          fill={CARD_FILL}
          {...INK}
        />

        {/* The "Brandbasket" diagonal crease line across the plaque corner */}
        <path d="M 44 165 L 78 130" stroke="currentColor" strokeWidth={1.8} strokeDasharray="3 3" fill="none" />
        <path d="M 44 165 L 78 165 L 78 130 Z" fill={CARD_FILL} {...INK} />

        {/* Brand nameplate text pill */}
        <rect x="90" y="148" width="84" height="15" rx="3" fill="currentColor" />
        {/* Domain name subtitle tag */}
        <rect x="90" y="174" width="62" height="8" rx="2" fill="none" {...INK_THIN} />
      </g>

      {/* Celebratory confetti and ink stars */}
      <g className="text-accent-deep">
        <path d="M 70 96 Q 70 106 80 106 Q 70 106 70 116 Q 70 106 60 106 Q 70 106 70 96 Z" fill="currentColor" />
        <path d="M 194 102 Q 194 109 201 109 Q 194 109 194 116 Q 194 109 187 109 Q 194 109 194 102 Z" fill="currentColor" />
      </g>
    </g>
  );
}

/* =========================================================================
   SCENE 4: PRIVACY ("Saying plainly what the chat collects")
   The builder inspects and seals a privacy folio with an unyielding
   padlock & data-protection shield, guaranteeing no AI model training.
   ========================================================================= */
function PrivacyScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="down" />

      {/* Plain Privacy Agreement Folio Document */}
      <g>
        <rect x="58" y="148" width="80" height="106" rx="6" fill={CARD_FILL} {...INK} />
        {/* Folio header */}
        <line x1="72" y1="168" x2="114" y2="168" {...INK} />
        {/* Approved checkmark at the bottom */}
        <path d="M 85 224 L 94 232 L 115 214" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
      </g>

      {/* Heavy-Duty Security Padlock */}
      <g>
        {/* Padlock Shackle */}
        <path d="M 148 162 V 142 C 148 128 168 128 168 142 V 162" fill="none" {...INK} />
        {/* Padlock Body */}
        <rect x="136" y="162" width="44" height="46" rx="8" fill={CARD_FILL} {...INK} />
        {/* Keyhole */}
        <circle cx="158" cy="180" r="4.5" fill="currentColor" />
        <path d="M 156 182 L 155 194 H 161 L 160 182 Z" fill="currentColor" />
      </g>

      {/* Protective Shield outline above */}
      <path
        d="M 116 114 C 116 114 136 110 158 104 C 180 110 200 114 200 114 C 200 135 190 162 158 174 C 126 162 116 135 116 114 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
    </g>
  );
}

/* =========================================================================
   SCENE 5: SPEED ("Lighter pages on mobile data")
   The builder watches in delight as a feather-light supersonic page glider
   streaks across the air with speed trails, trimming bloat for mobile.
   ========================================================================= */
function SpeedScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="up" smile={true} />

      {/* Supersonic Feather-Light Page Glider taking flight */}
      <g>
        {/* Origami page dart / supersonic glider */}
        <path d="M 52 118 L 140 148 L 108 160 Z" fill={CARD_FILL} {...INK} />
        <path d="M 52 118 L 152 126 L 140 148 Z" fill={CARD_FILL} {...INK} />
        <line x1="52" y1="118" x2="140" y2="148" {...INK} />

        {/* Trailing speed airflow arcs */}
        <path d="M 148 156 Q 175 166 205 170" fill="none" stroke="currentColor" strokeWidth={2.4} strokeDasharray="6 6" />
        <path d="M 158 132 Q 190 136 220 142" fill="none" stroke="currentColor" strokeWidth={2.4} strokeDasharray="8 6" />
      </g>

      {/* 5-bar full mobile signal icon */}
      <g transform="translate(68, 205)">
        <rect x="0" y="24" width="4.5" height="12" rx="1" fill="currentColor" />
        <rect x="8" y="18" width="4.5" height="18" rx="1" fill="currentColor" />
        <rect x="16" y="12" width="4.5" height="24" rx="1" fill="currentColor" />
        <rect x="24" y="6" width="4.5" height="30" rx="1" fill="currentColor" />
        <rect x="32" y="0" width="4.5" height="36" rx="1" fill="currentColor" />
      </g>
    </g>
  );
}

/* =========================================================================
   SCENE 6: OWNERSHIP ("Your domain stays yours")
   The builder hands over the golden master key to the domain:
   registered in your name, held in your account, always yours.
   ========================================================================= */
function OwnershipScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="forward" smile={true} />

      {/* The Domain Master Key (tilted gracefully at an active angle) */}
      <g transform="translate(130, 205) rotate(-15) translate(-130, -205)">
        {/* Key Bow with globe coordinates */}
        <circle cx="150" cy="205" r="18" fill={CARD_FILL} {...INK} />
        <ellipse cx="150" cy="205" rx="9" ry="18" fill="none" {...INK_THIN} />
        <line x1="132" y1="205" x2="168" y2="205" {...INK_THIN} />

        {/* Key Shaft */}
        <line x1="132" y1="205" x2="72" y2="205" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />
        {/* Key Teeth */}
        <path d="M 86 205 V 218 M 78 205 V 222" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" />

        {/* Domain name tag attached to the key */}
        <g transform="translate(165, 218) rotate(25)">
          <rect x="0" y="0" width="50" height="22" rx="4" fill={CARD_FILL} {...INK} />
          <circle cx="7" cy="11" r="2.5" fill="currentColor" />
          <line x1="16" y1="11" x2="42" y2="11" stroke="currentColor" strokeWidth={2.2} />
        </g>
      </g>

      {/* Unlocked lock symbol in background */}
      <g opacity={0.85}>
        <path d="M 80 135 V 122 C 80 110 94 104 104 114" fill="none" {...INK} />
        <rect x="70" y="135" width="34" height="28" rx="6" fill={CARD_FILL} {...INK} />
        <circle cx="87" cy="149" r="3" fill="currentColor" />
      </g>
    </g>
  );
}

/* =========================================================================
   SCENE 7: CARE ("A note with every invoice")
   The builder meticulously drafts a warm, personalized handwritten note
   with ink pen on an invoice clipboard, steaming mug on the desk.
   ========================================================================= */
function CareScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="down" smile={true} />

      {/* Clipboard with monthly invoice & handwritten note */}
      <g>
        {/* Wooden board */}
        <rect x="94" y="150" width="88" height="118" rx="6" fill={CARD_FILL} {...INK} />
        {/* Metal clip at top */}
        <rect x="122" y="144" width="32" height="12" rx="3" fill={CARD_FILL} {...INK} />

        {/* Checklist of what was done this month */}
        <path d="M 106 180 L 110 184 L 117 176" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <line x1="124" y1="180" x2="164" y2="180" {...INK_THIN} />

        <path d="M 106 200 L 110 204 L 117 196" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <line x1="124" y1="200" x2="158" y2="200" {...INK_THIN} />

        {/* Plain-English personal note handwritten curves at the bottom */}
        <path d="M 106 230 Q 116 226 128 230 T 152 230" fill="none" {...INK_THIN} />

        {/* Heart seal mark of personal care */}
        <circle cx="166" cy="245" r="5" fill="none" {...INK_THIN} />
        <path d="M 163 245 C 163 243 166 242 166 245 C 166 242 169 243 169 245 C 169 247 166 248 166 248 C 166 248 163 247 163 245 Z" fill="currentColor" />
      </g>

      {/* Steaming ceramic coffee mug beside clipboard */}
      <g>
        <rect x="46" y="240" width="26" height="30" rx="4" fill={CARD_FILL} {...INK} />
        {/* Mug handle */}
        <path d="M 46 246 C 37 246 37 260 46 260" fill="none" {...INK} />
        {/* Steam wisps rising */}
        <path d="M 54 232 C 50 226 58 220 54 214" fill="none" {...INK_THIN} />
        <path d="M 64 235 C 60 228 68 222 64 216" fill="none" {...INK_THIN} />
      </g>
    </g>
  );
}

/* =========================================================================
   SCENE 8: PLAIN (Fallback default)
   The builder focused at their laptop, creating things that work.
   ========================================================================= */
function PlainScene(): ReactElement {
  return (
    <g>
      <DashedThoughtLoop />
      <BuilderBody />
      <BuilderHead eyeGaze="down" />

      {/* Laptop */}
      <path
        d="M 134 270 L 123 222 C 122 216 126 214 132 214 L 227 214 C 233 214 236 217 237 222 L 247 270 Z"
        fill={CARD_FILL}
        {...INK}
      />
      <circle cx="185" cy="245" r="7" fill="none" {...INK_THIN} />

      {/* Radiating screen rays */}
      <line x1="120" y1="202" x2="105" y2="195" {...INK} />
      <line x1="130" y1="188" x2="116" y2="173" {...INK} />
      <line x1="152" y1="180" x2="148" y2="160" {...INK} />
    </g>
  );
}

const DRAWINGS: Readonly<Record<string, () => ReactElement>> = {
  chat: ChatScene,
  stack: StackScene,
  name: NameScene,
  privacy: PrivacyScene,
  speed: SpeedScene,
  ownership: OwnershipScene,
  care: CareScene,
};

/**
 * Hand-drawn minimalist vector illustration for changelog entries, reused by the dashboard's empty screens.
 *
 * Copied from the marketing website (fynix-website/components/changelog-art.tsx) so the dashboard shows the same
 * builder, drawn by the same code, rather than a lookalike. Keep the two in step by hand: the repositories share no
 * build, so a change to one will not reach the other.
 *
 * Each changelog date features the exact same builder character (curly hair, round spectacles,
 * hand-drawn line weight), while their behavior, actions, and surrounding elements
 * dynamically transform to illustrate the specific release story.
 */
export function ChangelogArt({ entry, className, ...props }: ChangelogArtProps): ReactElement {
  const Scene = DRAWINGS[entry] ?? PlainScene;

  return (
    <svg
      viewBox="0 0 420 290"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <Scene />
    </svg>
  );
}
