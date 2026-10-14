import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const reportBrowserError = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("@firstfold/shared/lib/error-report", () => ({ reportBrowserError }));

const { reportBoundaryError } = await import("./report-boundary-error");

describe("reportBoundaryError", () => {
  beforeEach(() => {
    captureException.mockClear();
    reportBrowserError.mockClear();
    vi.stubGlobal("window", { location: { pathname: "/app-host/billing" } });
  });

  it("reports a browser error once to each place, however often the effect runs", () => {
    const error = new Error("boom");
    reportBoundaryError(error);
    reportBoundaryError(error);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(reportBrowserError).toHaveBeenCalledTimes(1);
    expect(reportBrowserError.mock.calls[0]?.[1]).toMatchObject({ app: "platform", operation: "error_boundary", route: "/app-host/billing", severity: "error" });
  });

  it("passes the fatal severity of the root boundary", () => {
    reportBoundaryError(new Error("root"), "fatal");
    expect(reportBrowserError.mock.calls[0]?.[1]).toMatchObject({ severity: "fatal" });
  });

  it("does not resend a server error that carries a digest to Sentry", () => {
    const error = Object.assign(new Error("server"), { digest: "123" });
    reportBoundaryError(error);
    expect(captureException).not.toHaveBeenCalled();
    expect(reportBrowserError).toHaveBeenCalledTimes(1);
  });
});
