import { describe, expect, it } from "vitest";
import {
  allowsAnyLocalHost,
  appOriginForHost,
  isAppOrigin,
  isLocalHost,
  isPayloadAdminPath,
  normaliseHost,
  readOriginsFromEnv,
  resolveSurface,
  rewritePathForSurface,
  type SurfaceOrigins,
} from "./surfaces";

const origins: SurfaceOrigins = { app: "http://app.localhost:3000" };

describe("normaliseHost", () => {
  it("lowercases and keeps the port", () => {
    expect(normaliseHost("App.LocalHost:3000")).toBe("app.localhost:3000");
  });

  it("drops a trailing dot on the host name", () => {
    expect(normaliseHost("app.localhost.:3000")).toBe("app.localhost:3000");
    expect(normaliseHost("example.com.")).toBe("example.com");
  });

  it("rejects values that are not a host", () => {
    expect(normaliseHost("")).toBeNull();
    expect(normaliseHost("evil.com/path")).toBeNull();
    expect(normaliseHost("user@evil.com")).toBeNull();
    expect(normaliseHost("[::1]:3000")).toBeNull();
  });
});

describe("resolveSurface", () => {
  it("maps the app host to its surface", () => {
    expect(resolveSurface("app.localhost:3000", origins)).toBe("app");
    expect(resolveSurface("APP.localhost:3000", origins)).toBe("app");
  });

  /**
   * Customer websites are separate static projects, not served by this app, so every host but the two dashboards
   * is refused here. A client's own domain reaching this proxy means something is misconfigured.
   */
  it("returns null for unknown or missing hosts, including the marketing website's", () => {
    expect(resolveSurface("localhost:3000", origins)).toBeNull();
    expect(resolveSurface("evil.example", origins)).toBeNull();
    expect(resolveSurface("aster-physio.fynix.digital", origins)).toBeNull();
    // The staff console is its own app on its own origin now, so its host is not ours to answer.
    expect(resolveSurface("admin.localhost:3000", origins)).toBeNull();
    expect(resolveSurface(null, origins)).toBeNull();
  });

  it("does not let a dashboard host on the wrong port reach a dashboard", () => {
    expect(resolveSurface("app.localhost:4000", origins)).toBeNull();
  });
});

describe("any local address, in local development", () => {
  const local: SurfaceOrigins = { ...origins, anyLocalHost: true };

  it("knows a loopback name from any other", () => {
    for (const host of ["localhost", "localhost:3081", "app.localhost:3000", "anything.at.all.localhost:9", "127.0.0.1:3081", "127.8.9.10"]) {
      expect(isLocalHost(host)).toBe(true);
    }
    for (const host of ["fynix.digital", "localhost.evil.example", "notlocalhost:3000", "128.0.0.1", "127.0.0.1.evil.example", "10.0.0.5:3000"]) {
      expect(isLocalHost(host)).toBe(false);
    }
  });

  it("answers the dashboard on every local address and port, and still on its own host", () => {
    for (const host of ["localhost:3081", "LOCALHOST:3081", "127.0.0.1:3081", "app-ads.localhost:3081", "whatever.localhost:4000", "localhost"]) {
      expect(resolveSurface(host, local)).toBe("app");
    }
    expect(resolveSurface("app.localhost:3000", local)).toBe("app");
  });

  it("still refuses every host that is not local", () => {
    for (const host of ["evil.example", "localhost.evil.example:3081", "aster-physio.fynix.digital", "192.168.1.20:3081", "[::1]:3081"]) {
      expect(resolveSurface(host, local)).toBeNull();
    }
    expect(resolveSurface(null, local)).toBeNull();
  });

  it("is on only under the dev server, never in a production build or a test run", () => {
    expect(allowsAnyLocalHost({ NODE_ENV: "development" })).toBe(true);
    expect(allowsAnyLocalHost({ NODE_ENV: "production" })).toBe(false);
    expect(allowsAnyLocalHost({ NODE_ENV: "test" })).toBe(false);
    expect(allowsAnyLocalHost({})).toBe(false);
    expect(readOriginsFromEnv({ APP_ORIGIN: origins.app, NODE_ENV: "development" })).toEqual(local);
    expect(readOriginsFromEnv({ APP_ORIGIN: origins.app, NODE_ENV: "production" })).toEqual(origins);
  });
});

describe("isAppOrigin", () => {
  const local: SurfaceOrigins = { ...origins, anyLocalHost: true };

  it("accepts the configured app origin, and nothing else, by default", () => {
    expect(isAppOrigin("http://app.localhost:3000", "app.localhost:3000", origins)).toBe(true);
    expect(isAppOrigin("http://localhost:3000", "localhost:3000", origins)).toBe(false);
    expect(isAppOrigin("https://evil.example", "app.localhost:3000", origins)).toBe(false);
    expect(isAppOrigin(null, "app.localhost:3000", origins)).toBe(false);
  });

  it("in local development, accepts the local address the request itself arrived on", () => {
    expect(isAppOrigin("http://localhost:3081", "localhost:3081", local)).toBe(true);
    expect(isAppOrigin("http://127.0.0.1:3081", "127.0.0.1:3081", local)).toBe(true);
    expect(isAppOrigin("http://app.localhost:3000", "localhost:3081", local)).toBe(true);
  });

  it("in local development, still refuses another site's page, another local port's page, and junk", () => {
    expect(isAppOrigin("https://evil.example", "localhost:3081", local)).toBe(false);
    expect(isAppOrigin("http://localhost:3190", "localhost:3081", local)).toBe(false);
    expect(isAppOrigin("http://evil.example", "evil.example", local)).toBe(false);
    expect(isAppOrigin("not an origin", "localhost:3081", local)).toBe(false);
    expect(isAppOrigin("http://localhost:3081", null, local)).toBe(false);
  });
});

describe("rewritePathForSurface", () => {
  it("prefixes dashboard paths", () => {
    expect(rewritePathForSurface("app", "/")).toBe("/app-host");
    expect(rewritePathForSurface("app", "/login")).toBe("/app-host/login");
  });

});

describe("isPayloadAdminPath", () => {
  it("matches /admin and anything under it", () => {
    expect(isPayloadAdminPath("/admin")).toBe(true);
    expect(isPayloadAdminPath("/admin/collections/pages")).toBe(true);
  });

  it("does not match paths that merely start with the letters", () => {
    expect(isPayloadAdminPath("/administrator")).toBe(false);
    expect(isPayloadAdminPath("/admin-host/login")).toBe(false);
    expect(isPayloadAdminPath("/")).toBe(false);
  });
});

describe("readOriginsFromEnv", () => {
  it("reads the app origin", () => {
    expect(readOriginsFromEnv({ APP_ORIGIN: origins.app })).toEqual(origins);
  });

  it("ignores origins that belong to the other apps", () => {
    expect(
      readOriginsFromEnv({
        MARKETING_ORIGIN: "http://localhost:3000",
        ADMIN_ORIGIN: "http://admin.localhost:3003",
        APP_ORIGIN: origins.app,
      }),
    ).toEqual(origins);
  });

  it("returns null when the origin is missing, so every request 404s", () => {
    expect(readOriginsFromEnv({})).toBeNull();
    expect(readOriginsFromEnv({ APP_ORIGIN: undefined })).toBeNull();
  });

  it("treats a whitespace-only value as missing", () => {
    expect(readOriginsFromEnv({ APP_ORIGIN: "\t" })).toBeNull();
  });

  it("throws on an origin that is not a URL", () => {
    expect(() => readOriginsFromEnv({ APP_ORIGIN: "localhost" })).toThrow("APP_ORIGIN");
  });

  it("keeps only the origin from a URL that includes a path", () => {
    expect(readOriginsFromEnv({ APP_ORIGIN: "http://app.localhost:3000/some/path" })).toEqual(origins);
  });
});

describe("the dashboard under next dev", () => {
  const local: SurfaceOrigins = { app: "http://app-ads.localhost:3097", anyLocalHost: true };

  it("sends a user back to the host they are on, when it is a local one", () => {
    expect(appOriginForHost("localbusiness.localhost:3097", local)).toBe("http://localbusiness.localhost:3097");
    expect(appOriginForHost("app-ads.localhost:3097", local)).toBe("http://app-ads.localhost:3097");
    expect(appOriginForHost("localhost:3097", local)).toBe("http://localhost:3097");
  });

  it("sends everyone else to the app origin, and never to a host it was only told about", () => {
    expect(appOriginForHost(null, local)).toBe("http://app-ads.localhost:3097");
    expect(appOriginForHost("evil.example", local)).toBe("http://app-ads.localhost:3097");
    expect(appOriginForHost("localbusiness.localhost:3097", { app: local.app })).toBe("http://app-ads.localhost:3097");
  });
});
