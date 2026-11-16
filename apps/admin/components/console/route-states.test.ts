import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListSkeleton, RouteError } from "./route-states";

describe("route states", () => {
  it("shows a labelled loading skeleton with no spinner", () => {
    const html = renderToStaticMarkup(createElement(ListSkeleton, { label: "Loading payments" }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading payments");
    expect(html).toContain("motion-pulse");
    expect(html).not.toContain("spin");
  });

  it("says what happened and offers Try again, with the digest but never the message", () => {
    const error = Object.assign(new Error("secret database detail"), { digest: "abc123" });
    const html = renderToStaticMarkup(createElement(RouteError, { error, reset: vi.fn() }));
    expect(html).toContain("This page could not load");
    expect(html).toContain("Try again");
    expect(html).toContain("abc123");
    expect(html).not.toContain("secret database detail");
    expect(html).toContain('role="alert"');
  });

  it("works without a digest", () => {
    const html = renderToStaticMarkup(createElement(RouteError, { error: new Error("x"), reset: vi.fn() }));
    expect(html).not.toContain("give them this code");
  });
});
