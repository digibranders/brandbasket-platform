import type { ReactElement, SVGProps } from "react";

export interface BuilderIllustrationProps extends SVGProps<SVGSVGElement> {
  readonly className?: string;
}

/**
 * Hand-drawn minimalist vector illustration of a builder/engineer at work on a laptop.
 * Replicated in pure SVG code from the reference line art:
 * - Curly dark hair
 * - Round spectacles with focused downward gaze
 * - Angular L-shaped nose and focused mouth
 * - Angled laptop with circular logo and desk line
 * - Radiating screen light rays
 * - Whimsical dashed thought curlicue floating in the air
 */
export function BuilderIllustration({ className, ...props }: BuilderIllustrationProps): ReactElement {
  return (
    <svg
      viewBox="0 0 500 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      <defs>
        <style>{`
          @keyframes screenSparkle {
            0%, 100% { opacity: 0.9; transform: scale(1); }
            50% { opacity: 0.45; transform: scale(0.96); }
          }
          @keyframes thoughtDrift {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
          .animate-sparkle {
            animation: screenSparkle 3s ease-in-out infinite;
            transform-origin: 130px 190px;
          }
          .animate-thought {
            animation: thoughtDrift 4s ease-in-out infinite;
            transform-origin: 350px 140px;
          }
        `}</style>
      </defs>

      {/* Floating dashed thought/curlicue loop */}
      <g className="animate-thought">
        <path
          d="M 298 103 C 322 76 368 76 384 104 C 395 124 394 145 378 155 C 360 166 348 152 355 137 C 363 120 380 128 385 146 C 390 174 374 206 363 222"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="5 5"
          fill="none"
          className="opacity-80"
        />
      </g>

      {/* Radiating light rays emitting from the laptop screen */}
      <g className="animate-sparkle">
        <line x1="120" y1="202" x2="105" y2="195" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="130" y1="188" x2="116" y2="173" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="152" y1="180" x2="148" y2="160" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </g>

      {/* Desk baseline extending to the right */}
      <line x1="247" y1="270" x2="316" y2="270" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />

      {/* Left Shoulder (disappearing behind laptop) */}
      <path
        d="M 253 208 C 236 212 221 225 217 242"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Right Shoulder & Body */}
      <path
        d="M 295 205 C 310 212 344 233 360 270"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Neck lines */}
      <path d="M 251 189 L 253 208" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M 285 181 L 291 206" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />

      {/* Crewneck collar curve */}
      <path
        d="M 253 208 C 257 226 287 226 295 205"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* Face & Jawline */}
      <path
        d="M 223 159 C 224 173 227 186 235 188 C 243 190 254 189 264 184 C 273 179 276 172 277 163"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="var(--color-card, #ffffff)"
      />

      {/* Ear on the right */}
      <path
        d="M 276 148 C 286 146 291 152 289 160 C 287 166 280 166 277 163"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="var(--color-card, #ffffff)"
      />
      {/* Ear inner cartilage detail */}
      <path
        d="M 280 153 C 283 155 283 158 281 160"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

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
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* Glasses */}
      {/* Left lens */}
      <circle cx="224" cy="148" r="11" stroke="currentColor" strokeWidth="2.6" fill="var(--color-card, #ffffff)" />
      {/* Right lens */}
      <circle cx="252" cy="148" r="11" stroke="currentColor" strokeWidth="2.6" fill="var(--color-card, #ffffff)" />
      {/* Bridge connecting lenses */}
      <line x1="235" y1="148" x2="241" y2="148" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      {/* Right frame temple arm to ear */}
      <line x1="263" y1="148" x2="276" y2="150" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      {/* Left frame temple edge */}
      <path d="M 213 148 Q 216 142 220 137" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />

      {/* Eyes looking downward at the laptop screen */}
      <circle cx="223.5" cy="148" r="1.8" fill="currentColor" />
      <circle cx="251" cy="148" r="1.8" fill="currentColor" />

      {/* Nose (clean L-shaped line) */}
      <path
        d="M 234 153 V 166 H 227"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="miter"
        fill="none"
      />

      {/* Focused mouth line */}
      <line x1="233" y1="175" x2="240" y2="175" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />

      {/* Laptop (open lid facing viewer) */}
      <path
        d="M 134 270 
           L 123 222 
           C 122 216 126 214 132 214 
           L 227 214 
           C 233 214 236 217 237 222 
           L 247 270 Z"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="var(--color-card, #ffffff)"
      />
      {/* Circle logo on the laptop lid */}
      <circle cx="185" cy="245" r="7" stroke="currentColor" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
