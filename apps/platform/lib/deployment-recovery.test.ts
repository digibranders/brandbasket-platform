import { createElement, useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import DashboardError from "../app/app-host/error";
import GlobalError from "../app/global-error";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: vi.fn(),
}));
vi.mock("@/lib/report-boundary-error", () => ({ reportBoundaryError: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe.each([DashboardError, GlobalError])("deployment recovery boundary", (Boundary) => {
  it("announces a missing action and waits for an explicit reload", () => {
    const error = new Error("Server Action old-action was not found on the server.");
    error.name = "UnrecognizedActionError";
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload }, get sessionStorage(): never { throw new Error("Storage blocked"); } });
    const markup = renderToStaticMarkup(createElement(Boundary, { error, reset: vi.fn() }));
    expect(markup).toContain("Firstfold was updated. Reload to continue.");
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Reload page");
    expect(markup).toContain("Enter your details again after reloading.");
    for (const [effect] of vi.mocked(useEffect).mock.calls) effect();
    expect(reload).not.toHaveBeenCalled();
    expect(markup).not.toContain("Try again");
  });

  it("keeps the generic fallback for unrelated failures", () => {
    const markup = renderToStaticMarkup(createElement(Boundary, { error: new Error("Internal fault"), reset: vi.fn() }));
    expect(markup).toContain("Try again");
    expect(markup).not.toContain("Firstfold was updated");
    expect(markup).not.toContain("Internal fault");
  });
});
