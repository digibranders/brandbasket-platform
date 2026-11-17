import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, middleware } from "./middleware";

describe("customer middleware", () => {
  const runs = (path: string): boolean => new RegExp(`^${config.matcher[0]}$`).test(path);

  it.each(["/sw.js", "/manifest.webmanifest", "/icons/icon-512.png", "/icons/icon-maskable-512.png"])("passes %s on untouched", (path) => {
    const response = middleware(new NextRequest(`http://app.brandbasket.localhost:3197${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not run for Next's static files or the tracking script", () => {
    expect(runs("/_next/static/chunk.js")).toBe(false);
    expect(runs("/t/v1.js")).toBe(false);
    expect(runs("/billing")).toBe(true);
  });
});
