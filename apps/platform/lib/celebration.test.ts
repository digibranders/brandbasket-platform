import { describe, expect, it } from "vitest";
import { CONFETTI_COLOURS, FADE_FRAMES, LIFETIME_FRAMES, PIECES_PER_CANNON, createPieces, opacityAt, stepPieces, wantsWelcome, withoutWelcome } from "./celebration";

/** A repeatable stand-in for Math.random. */
function sequence(): () => number {
  let seed = 7;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

describe("the welcome parameter", () => {
  it("is asked for only by welcome=1", () => {
    expect(wantsWelcome("?welcome=1")).toBe(true);
    expect(wantsWelcome("?a=b&welcome=1")).toBe(true);
    expect(wantsWelcome("")).toBe(false);
    expect(wantsWelcome("?welcome=0")).toBe(false);
    expect(wantsWelcome("?welcome=true")).toBe(false);
  });

  it("is taken off an address and nothing else", () => {
    expect(withoutWelcome("?welcome=1")).toBe("");
    expect(withoutWelcome("?a=b&welcome=1")).toBe("?a=b");
    expect(withoutWelcome("?a=b")).toBe("?a=b");
  });
});

describe("createPieces", () => {
  const pieces = createPieces(1000, 800, sequence());
  const left = pieces.slice(0, PIECES_PER_CANNON);
  const right = pieces.slice(PIECES_PER_CANNON);

  it("fires two bursts, one from each bottom corner", () => {
    expect(pieces).toHaveLength(PIECES_PER_CANNON * 2);
    expect(left.every((piece) => piece.x === 0)).toBe(true);
    expect(right.every((piece) => piece.x === 1000)).toBe(true);
    expect(pieces.every((piece) => piece.y >= 800 * 0.88 && piece.y <= 800)).toBe(true);
  });

  it("aims both bursts up and in", () => {
    expect(left.every((piece) => piece.vy < 0 && piece.vx > 0)).toBe(true);
    expect(right.every((piece) => piece.vy < 0 && piece.vx < 0)).toBe(true);
  });

  it("uses only Brandbasket's colours", () => {
    const allowed: readonly string[] = CONFETTI_COLOURS;
    expect(pieces.every((piece) => allowed.includes(piece.colour))).toBe(true);
  });
});

describe("stepPieces", () => {
  it("pulls the paper down: it slows on the way up and falls in the end", () => {
    const [piece] = createPieces(1000, 800, sequence());
    if (piece === undefined) throw new Error("no piece");
    const startVy = piece.vy;
    stepPieces([piece]);
    expect(piece.vy).toBeGreaterThan(startVy);
    for (let frame = 0; frame < 120; frame += 1) stepPieces([piece]);
    expect(piece.vy).toBeGreaterThan(0);
  });
});

describe("opacityAt", () => {
  it("is full, then fades, then is gone at the end of the paper's life", () => {
    expect(opacityAt(0)).toBe(1);
    expect(opacityAt(LIFETIME_FRAMES - FADE_FRAMES)).toBe(1);
    expect(opacityAt(LIFETIME_FRAMES - FADE_FRAMES / 2)).toBeCloseTo(0.5, 5);
    expect(opacityAt(LIFETIME_FRAMES)).toBe(0);
    expect(opacityAt(LIFETIME_FRAMES + 50)).toBe(0);
  });
});
