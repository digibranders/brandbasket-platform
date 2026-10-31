import { createPieces, LIFETIME_FRAMES, opacityAt, stepPieces } from "@/lib/celebration";

/**
 * Fixed 60Hz physics driven by elapsed time keeps the three-second celebration consistent on every display.
 * The returned cleanup also clears the canvas and removes listeners, including when native Escape closes the dialog.
 */
export function firePoppers(canvas: HTMLCanvasElement): () => void {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (motion.matches) return () => undefined;
  const context = canvas.getContext("2d");
  if (context === null) return () => undefined;

  let width = window.innerWidth;
  let height = window.innerHeight;
  const pieces = createPieces(width, height);
  const theme = getComputedStyle(canvas);
  const colours = ["--color-rattan", "--color-ok", "--color-c-growth", "--color-rattan-wash", "--color-rattan-text"]
    .map((token) => theme.getPropertyValue(token).trim());
  const resize = (): void => {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    for (const piece of pieces) {
      piece.x *= nextWidth / width;
      piece.y *= nextHeight / height;
    }
    width = nextWidth;
    height = nextHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.scale(ratio, ratio);
  };
  resize();
  const started = performance.now();
  let frame = 0;
  let handle = 0;
  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(handle);
    context.clearRect(0, 0, width, height);
    window.removeEventListener("resize", resize);
    motion.removeEventListener("change", onMotionChange);
  };
  const onMotionChange = (): void => { if (motion.matches) stop(); };
  const draw = (timestamp: number): void => {
    if (stopped) return;
    const targetFrame = Math.min(LIFETIME_FRAMES, Math.floor((timestamp - started) / (1000 / 60)));
    while (frame < targetFrame) {
      stepPieces(pieces);
      frame += 1;
    }
    context.clearRect(0, 0, width, height);
    const alpha = opacityAt(frame);
    if (alpha > 0) {
      for (const [index, piece] of pieces.entries()) {
        context.save();
        context.globalAlpha = alpha;
        context.translate(piece.x, piece.y);
        context.rotate(piece.spin);
        context.fillStyle = colours[index % colours.length] || piece.colour;
        // The paper turns over as it spins: its height narrows to nothing and back.
        context.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h * Math.abs(Math.cos(piece.spin)));
        context.restore();
      }
    }
    if (frame < LIFETIME_FRAMES) handle = requestAnimationFrame(draw);
    else stop();
  };
  window.addEventListener("resize", resize);
  motion.addEventListener("change", onMotionChange);
  handle = requestAnimationFrame(draw);
  return stop;
}
