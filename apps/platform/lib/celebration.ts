/**
 * The party poppers that go off when a payment opens a plan. This file is the arithmetic only (where the paper starts,
 * how it flies, how it fades); components/panel/payment-celebration.tsx draws it.
 *
 * Two cannons sit at the foot of the screen, one in each bottom corner, aimed up and in. Each throws a burst of small
 * rectangles of paper, which spin and drift as they fall and fade out together.
 */

import { addOnById, MONTHLY_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/add-ons";

/** The query parameter a landing page carries to say "a payment just opened this plan". */
export const WELCOME_PARAM = "welcome";

/** Where an account lands the moment its payment has opened its plan: Home, with the celebration switched on. */
export const MEMBER_WELCOME_HREF = `/?${WELCOME_PARAM}=1`;

/** Whether an address's query asks for the celebration. Only the exact value 1 does. */
export function wantsWelcome(search: string): boolean {
  return new URLSearchParams(search).get(WELCOME_PARAM) === "1";
}

/** The address without the celebration's parameter, so a refresh or a shared link does not replay it. */
export function withoutWelcome(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(WELCOME_PARAM);
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}

/** Brandbasket's own colours, bright enough to read on the dimmed page. */
/** A service line as the welcome reads it: which service, whether it is paid for, and whether it is on its way out. */
export interface WelcomeLine {
  readonly addOn: string;
  readonly status: string;
  readonly endRequestedAt: Date | null;
}

/** What the welcome lists as now yours: the services the payment opened, by name, in catalogue order. */
export function welcomeServices(lines: readonly WelcomeLine[]): readonly string[] {
  const paid = new Set(lines.filter((line) => line.status === "active" && line.endRequestedAt === null).map((line) => line.addOn));
  return MONTHLY_ADD_ON_IDS.filter((id) => paid.has(id)).map((id) => addOnById(id).title);
}

export const CONFETTI_COLOURS = ["#63001e", "#f4b46f", "#f2c572", "#b27716", "#3d7a4a", "#f4dfe2", "#ffffff"] as const;

export interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Width and height of the rectangle. */
  readonly w: number;
  readonly h: number;
  readonly colour: string;
  spin: number;
  readonly spinRate: number;
  wobble: number;
  readonly wobbleRate: number;
}

/** Pieces thrown by each cannon. */
export const PIECES_PER_CANNON = 90;

/** How many frames the paper lives, and how many of its last frames it spends fading. */
export const LIFETIME_FRAMES = 260;
export const FADE_FRAMES = 90;

/** A random number in [low, high). `random` is Math.random in the browser and a fixed sequence in tests. */
function between(random: () => number, low: number, high: number): number {
  return low + random() * (high - low);
}

/**
 * Both cannons' pieces, at the moment they fire. The left cannon aims up and to the right, the right one up and to the
 * left, each a little off true so the burst is a fan and not a line.
 */
export function createPieces(width: number, height: number, random: () => number = Math.random): Piece[] {
  const pieces: Piece[] = [];
  const aims: readonly (readonly [number, number])[] = [
    [0, -Math.PI / 3.1],
    [width, -Math.PI + Math.PI / 3.1],
  ];
  for (const [x, aim] of aims) {
    for (let index = 0; index < PIECES_PER_CANNON; index += 1) {
      const speed = between(random, 11, 24);
      const angle = aim + between(random, -0.42, 0.42);
      pieces.push({
        x,
        y: height * between(random, 0.88, 1),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: between(random, 6, 11),
        h: between(random, 8, 15),
        colour: CONFETTI_COLOURS[Math.floor(random() * CONFETTI_COLOURS.length)] ?? "#63001e",
        spin: between(random, 0, 2 * Math.PI),
        spinRate: between(random, -0.22, 0.22),
        wobble: between(random, 0, 2 * Math.PI),
        wobbleRate: between(random, 0.05, 0.12),
      });
    }
  }
  return pieces;
}

/** Moves every piece on by one frame: gravity pulls, the air slows, the paper wobbles and turns. */
export function stepPieces(pieces: readonly Piece[]): void {
  for (const piece of pieces) {
    piece.vy += 0.34;
    piece.vx *= 0.992;
    piece.vy *= 0.992;
    piece.wobble += piece.wobbleRate;
    piece.x += piece.vx + 0.9 * Math.sin(piece.wobble);
    piece.y += piece.vy;
    piece.spin += piece.spinRate;
  }
}

/** How opaque the paper is on a frame: fully until it starts to fade, then down to nothing at the end of its life. */
export function opacityAt(frame: number): number {
  return Math.max(0, Math.min(1, (LIFETIME_FRAMES - frame) / FADE_FRAMES));
}
