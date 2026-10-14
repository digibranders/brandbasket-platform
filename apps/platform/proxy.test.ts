import { AsyncLocalStorage } from "node:async_hooks";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, createProxy } from "./proxy";
import type { SurfaceOrigins } from "./lib/surfaces";

// `next/experimental/testing/server` lazily creates an AsyncLocalStorage through Next's own
// createAsyncLocalStorage() helper, which falls back to a throwing stub unless
// globalThis.AsyncLocalStorage is already set. That global is normally installed by Next's own
// dev/build runtime before any request is handled; a bare Vitest process never runs that bootstrap,
// so the import below throws "Invariant: AsyncLocalStorage accessed in runtime where it is not
// available" unless we install the real Node implementation first. This must run before the
// `next/experimental/testing/server` import below, and before any other module transitively
// imports it, so it is hoisted to the top of the file.
(globalThis as unknown as { AsyncLocalStorage: typeof AsyncLocalStorage }).AsyncLocalStorage = AsyncLocalStorage;

const { unstable_doesMiddlewareMatch, isRewrite, getRewrittenUrl } = await import(
  "next/experimental/testing/server"
);

const origins: SurfaceOrigins = { app: "http://app.localhost:3000" };

function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

function request(url: string, host: string): NextRequest {
  return new NextRequest(url, { headers: { host } });
}

describe("config.matcher", () => {
  it("runs for dashboard, dotted and ordinary paths", () => {
    for (const path of [
      "/",
      "/login",
      "/sites/acme.com",
      "/app-host/x.json",
      "/icons",
      "/pricing",
      // Customer media URLs carry no extension, so the static-file exclusion never skips host routing for them.
      "/media/0192f3c4-2222-7000-8000-000000000002",
    ]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("skips Next internals, API routes, icons and static files by extension", () => {
    for (const path of ["/_next/static/chunk.js", "/robots.txt", "/logo.png", "/icon", "/apple-icon"]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("skips the upload route, so Next never buffers an upload body for the proxy", () => {
    for (const path of ["/api/uploads", "/api/uploads?purpose=photo"]) {
      expect(matches(path), path).toBe(false);
    }
    // Only the /api/ prefix itself is skipped, not paths that merely start with the letters.
    for (const path of ["/uploads", "/apiary", "/app-host/api/uploads"]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it("skips the public feeds, so the website can read them on the app host without host routing", () => {
    for (const path of ["/api/pricing", "/api/directory/listings"]) {
      expect(matches(path), path).toBe(false);
    }
  });

  it("skips Payload's REST and GraphQL routes too, since they all live under the same /api/ prefix", () => {
    for (const path of ["/api/access", "/api/graphql", "/api/graphql-playground"]) {
      expect(matches(path), path).toBe(false);
    }
  });
});

describe("createProxy", () => {
  it("rewrites the app host, keeping the query string, and marks it noindex", () => {
    const proxy = createProxy(origins);
    const response = proxy(request("http://app.localhost:3000/login?next=/billing", "app.localhost:3000"));
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("http://app.localhost:3000/app-host/login?next=/billing");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });


  it("shows the dashboard no directory-only page: those paths get the dashboard's not-found screen", () => {
    const proxy = createProxy({ app: "http://localbusiness.localhost:3000" });
    for (const path of ["/deals", "/business", "/listing", "/advertise", "/reviews", "/leads", "/deals/new"]) {
      const response = proxy(request(`http://localbusiness.localhost:3000${path}`, "localbusiness.localhost:3000"));
      expect(isRewrite(response), path).toBe(true);
      expect(getRewrittenUrl(response), path).toBe("http://localbusiness.localhost:3000/app-host/not-here");
    }
    const billing = proxy(request("http://localbusiness.localhost:3000/billing", "localbusiness.localhost:3000"));
    expect(getRewrittenUrl(billing)).toBe("http://localbusiness.localhost:3000/app-host/billing");
  });

  it("rewrites a media URL on the app host to the app-host media route", () => {
    const proxy = createProxy(origins);
    const response = proxy(
      request("http://app.localhost:3000/media/0192f3c4-2222-7000-8000-000000000002", "app.localhost:3000"),
    );
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe(
      "http://app.localhost:3000/app-host/media/0192f3c4-2222-7000-8000-000000000002",
    );
  });

  it("no longer has an upload route of its own", () => {
    const proxy = createProxy(origins);
    // The old path now rewrites to a dashboard page that does not exist.
    expect(getRewrittenUrl(proxy(request("http://app.localhost:3000/uploads", "app.localhost:3000")))).toBe(
      "http://app.localhost:3000/app-host/uploads",
    );
  });


  /**
   * Payload's own admin UI is mounted at /admin in this app but has no surface to serve it: the staff console is
   * apps/admin now. It must never appear on the customer host, which is what collections/Media.ts's access block
   * assumes, so the proxy refuses it outright.
   */
  it("404s /admin, since Payload's UI has no host here any more", () => {
    const proxy = createProxy(origins);
    expect(proxy(request("http://app.localhost:3000/admin", "app.localhost:3000")).status).toBe(404);
    expect(proxy(request("http://app.localhost:3000/admin/collections/pages", "app.localhost:3000")).status).toBe(404);
  });

  it("404s an unknown host, including a client's own domain and the marketing website's", () => {
    const proxy = createProxy(origins);
    expect(proxy(request("http://evil.example/", "evil.example")).status).toBe(404);
    expect(proxy(request("http://localhost:3000/pricing", "localhost:3000")).status).toBe(404);
    expect(proxy(request("http://asterphysio.com/", "asterphysio.com")).status).toBe(404);
    // The staff console is its own app on its own origin now.
    expect(proxy(request("http://admin.localhost:3000/", "admin.localhost:3000")).status).toBe(404);
  });

  it("under the dev server, serves the dashboard on any local address, and still 404s every other host", () => {
    const proxy = createProxy({ ...origins, anyLocalHost: true });
    for (const host of ["localhost:3081", "127.0.0.1:3081", "app-ads.localhost:3081"]) {
      const response = proxy(request(`http://${host}/join?listing=x`, host));
      expect(isRewrite(response)).toBe(true);
      // Next writes a loopback address as "localhost" in the URL it hands on, so only the path is compared.
      const rewritten = new URL(getRewrittenUrl(response) ?? "");
      expect(rewritten.pathname + rewritten.search).toBe("/app-host/join?listing=x");
    }
    expect(proxy(request("http://evil.example/join", "evil.example")).status).toBe(404);
    expect(proxy(request("http://localhost:3081/admin", "localhost:3081")).status).toBe(404);
  });

  it("serves any local localbusiness.* address under the dev server", () => {
    const proxy = createProxy({ ...origins, anyLocalHost: true });
    const response = proxy(request("http://localbusiness.localhost:3097/login", "localbusiness.localhost:3097"));
    expect(isRewrite(response)).toBe(true);
  });

  it("404s everything when no origins are configured", () => {
    const proxy = createProxy(null);
    expect(proxy(request("http://app.localhost:3000/login", "app.localhost:3000")).status).toBe(404);
  });
});
