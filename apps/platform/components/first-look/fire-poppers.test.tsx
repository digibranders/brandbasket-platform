// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firePoppers } from "./fire-poppers";

let canvas: HTMLCanvasElement;
let reduced: boolean;
let onMotionChange: (() => void) | undefined;
const clearRect = vi.fn();
const cancel = vi.fn();
const request = vi.fn<(callback: FrameRequestCallback) => number>();
const removeMotionListener = vi.fn();
let nextFrame: FrameRequestCallback | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  reduced = false;
  nextFrame = undefined;
  onMotionChange = undefined;
  canvas = document.createElement("canvas");
  const context = {
    clearRect, scale: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    get matches(): boolean { return reduced; },
    addEventListener: (_type: string, listener: () => void): void => { onMotionChange = listener; },
    removeEventListener: removeMotionListener,
  })));
  let handle = 0;
  request.mockImplementation((callback) => { nextFrame = callback; return ++handle; });
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("firePoppers", () => {
  it("ends after three seconds even when only a few frames were rendered", () => {
    const stop = firePoppers(canvas);
    nextFrame?.(16);
    nextFrame?.(1500);
    const count = request.mock.calls.length;
    nextFrame?.(3001);
    expect(request).toHaveBeenCalledTimes(count);
    expect(clearRect).toHaveBeenCalled();
    stop();
  });

  it("does not draw or schedule animation for reduced motion", () => {
    reduced = true;
    firePoppers(canvas)();
    expect(canvas.getContext).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels and clears the canvas when dismissed", () => {
    const stop = firePoppers(canvas);
    stop();
    expect(cancel).toHaveBeenCalled();
    expect(clearRect).toHaveBeenCalled();
    expect(removeMotionListener).toHaveBeenCalled();
    const count = request.mock.calls.length;
    nextFrame?.(100);
    expect(request).toHaveBeenCalledTimes(count);
  });

  it("stops if reduced motion is enabled during the celebration", () => {
    const stop = firePoppers(canvas);
    reduced = true;
    onMotionChange?.();
    expect(cancel).toHaveBeenCalled();
    expect(clearRect).toHaveBeenCalled();
    stop();
  });

  it("handles an unavailable canvas context without scheduling animation", () => {
    vi.mocked(canvas.getContext).mockReturnValue(null);
    expect(() => firePoppers(canvas)()).not.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
