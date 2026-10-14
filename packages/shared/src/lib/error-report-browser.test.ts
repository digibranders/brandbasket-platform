import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });

describe("native browser error transport", () => {
  async function fixture() {
    vi.resetModules();
    const listeners = new Map<string, (event: { error?: unknown; reason?: unknown }) => void>();
    vi.stubGlobal("window", { location: { pathname: "/appointments/private-person" }, addEventListener: (event: string, listener: (event: { error?: unknown; reason?: unknown }) => void) => listeners.set(event, listener) });
    vi.stubGlobal("navigator", { userAgent: "Mozilla Chrome/145.0" });
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetcher);
    return { ...(await import("./error-report")), fetcher, listeners };
  }
  it("captures uncaught/rejection events and deduplicates boundaries without transmitting secrets", async () => {
    const { installBrowserErrorCapture, reportBrowserError, fetcher, listeners } = await fixture();
    installBrowserErrorCapture("platform", "abcdef123");
    const error = new TypeError("private patient secret");
    listeners.get("error")?.({ error });
    reportBrowserError(error, { app: "platform", operation: "error_boundary", route: "/appointments/private-person" });
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = fetcher.mock.calls[0]?.[1]?.body as string;
    expect(body).not.toMatch(/private-person|patient|secret/);
    expect(JSON.parse(body)).toMatchObject({ browser: "Chrome", operation: "browser_uncaught", route: "/appointments/[id]" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    listeners.get("unhandledrejection")?.({ reason: new Error("secret") });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not recapture a server digest and caps concurrent transport", async () => {
    const { reportBrowserError, fetcher } = await fixture();
    const error = Object.assign(new Error("private"), { digest: "12345" });
    reportBrowserError(error, { app: "platform", operation: "error_boundary", route: "/" });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockReturnValue(new Promise(() => undefined));
    for (let index = 0; index < 30; index += 1) reportBrowserError(new Error("private"), { app: "platform", operation: "browser_uncaught", route: "/" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("cleans up after a synchronous fetch failure so subsequent capture still works", async () => {
    const { reportBrowserError, fetcher } = await fixture();
    fetcher.mockImplementation(() => { throw new Error("transport unavailable"); });
    for (let index = 0; index < 4; index += 1) {
      reportBrowserError(new Error("private"), { app: "platform", operation: "browser_uncaught", route: "/" });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("aborts stalled transport after two seconds", async () => {
    vi.useFakeTimers();
    const { reportBrowserError, fetcher } = await fixture();
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation((_url: string, options: RequestInit) => {
      signal = options.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    });
    reportBrowserError(new Error("private"), { app: "platform", operation: "browser_uncaught", route: "/" });
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(signal?.aborted).toBe(true);
  });
});
