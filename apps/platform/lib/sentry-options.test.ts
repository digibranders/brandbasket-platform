import { beforeEach, describe, expect, it, vi } from "vitest";
import { sentryPrivacyOptions, sentryTracesSampleRate } from "./sentry-options";

const init = vi.fn();
vi.mock("@sentry/nextjs", () => ({ init, captureRouterTransitionStart: vi.fn(), replayIntegration: vi.fn() }));
vi.mock("@brandbasket/shared/lib/error-report", () => ({ installBrowserErrorCapture: vi.fn() }));

describe("sentry options", () => {
  beforeEach(() => {
    init.mockClear();
    vi.resetModules();
  });

  it("scrubs errors, transactions and breadcrumbs and sends no default PII", () => {
    expect(sentryPrivacyOptions.sendDefaultPii).toBe(false);
    const scrubbed = sentryPrivacyOptions.beforeSend({ type: undefined, request: { data: "x", url: "/a?b=1" } });
    expect(scrubbed.request).toEqual({ url: "/a" });
    expect(sentryPrivacyOptions.beforeBreadcrumb({ category: "console", message: "x" })).toBeNull();
  });

  it("keeps the tracing rates", () => {
    expect(sentryTracesSampleRate("development")).toBe(1.0);
    expect(sentryTracesSampleRate("production")).toBe(0.1);
  });

  it("starts the browser SDK with Replay off and scrubbing on", async () => {
    await import("../instrumentation-client");
    const options = init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
    expect(options.integrations).toBeUndefined();
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
    expect(options.sendDefaultPii).toBe(false);
  });

  it.each(["../sentry.server.config", "../sentry.edge.config"])("starts %s with scrubbing on and no replay", async (path) => {
    await import(path);
    const options = init.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeSendTransaction).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
    expect(options.integrations).toBeUndefined();
  });
});
