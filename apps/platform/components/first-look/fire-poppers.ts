import { createPieces, LIFETIME_FRAMES, opacityAt, stepPieces } from "@/lib/celebration";

/**
 * Draws the poppers: two bursts of paper from the bottom corners, over the dimmed page, for a few seconds. Returns a
 * function that stops it. Nothing is drawn for someone who has asked their device for less motion.
 */
export function firePoppers(canvas: HTMLCanvasElement): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => undefined;
  const context = canvas.getContext("2d");
  if (context === null) return () => undefined;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${String(width)}px`;
  canvas.style.height = `${String(height)}px`;
  context.scale(ratio, ratio);

  const pieces = createPieces(width, height);
  let frame = 0;
  let handle = 0;
  const draw = (): void => {
    frame += 1;
    context.clearRect(0, 0, width, height);
    stepPieces(pieces);
    const alpha = opacityAt(frame);
    if (alpha > 0) {
      for (const piece of pieces) {
        context.save();
        context.globalAlpha = alpha;
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillStyle = piece.colour;
        // The paper turns over as it spins: its height narrows to nothing and back.
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h * Math.abs(Math.cos(piece.spin)));
        context.restore();
      }
    }
    if (frame < LIFETIME_FRAMES) handle = requestAnimationFrame(draw);
    else context.clearRect(0, 0, width, height);
  };
  handle = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(handle);
}
