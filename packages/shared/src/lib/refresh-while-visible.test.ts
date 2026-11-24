import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRefreshing, type RefreshHost } from "./refresh-while-visible";

function host(visible = true) {
  const listeners = new Map<string, () => void>();
  const target: RefreshHost = {
    isVisible: () => state.visible,
    on: (event, handler) => {
      listeners.set(event, handler);
      return () => listeners.delete(event);
    },
  };
  const state = { visible };
  return { target, state, listeners, fire: (event: string) => listeners.get(event)?.() };
}

describe("startRefreshing", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("refreshes every interval while the page is visible", () => {
    const refresh = vi.fn();
    const { target } = host();
    startRefreshing(refresh, target, 60_000);
    vi.advanceTimersByTime(180_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it("does not refresh while the page is hidden", () => {
    const refresh = vi.fn();
    const { target, state } = host();
    startRefreshing(refresh, target, 60_000);
    state.visible = false;
    vi.advanceTimersByTime(180_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes when the window gets focus or the page becomes visible, at most once every 10 seconds", () => {
    const refresh = vi.fn();
    const { target, fire } = host();
    startRefreshing(refresh, target, 60_000);
    vi.advanceTimersByTime(11_000);
    fire("focus");
    fire("visibilitychange");
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(11_000);
    fire("focus");
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("ignores a visibility change to hidden", () => {
    const refresh = vi.fn();
    const { target, state, fire } = host();
    startRefreshing(refresh, target, 60_000);
    vi.advanceTimersByTime(11_000);
    state.visible = false;
    fire("visibilitychange");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stops everything when cleaned up", () => {
    const refresh = vi.fn();
    const { target, listeners } = host();
    const stop = startRefreshing(refresh, target, 60_000);
    stop();
    vi.advanceTimersByTime(180_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
