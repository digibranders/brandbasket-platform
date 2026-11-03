import { describe, expect, it } from "vitest";
import { allowsAnyLocalHost, appOriginForHost, isAppHost, isAppOrigin, isLocalHost, normaliseHost } from "./app-origin";

const production = { app: "https://app.brandbasket.in" } as const;
const development = { app: "http://localhost:3197", anyLocalHost: true } as const;

describe("normaliseHost", () => {
  it("lowercases, drops a trailing dot and keeps the port", () => {
    expect(normaliseHost(" App.BrandBasket.in. ")).toBe("app.brandbasket.in");
    expect(normaliseHost("localhost:3197")).toBe("localhost:3197");
  });

  it("refuses anything that is not a host", () => {
    expect(normaliseHost("a b")).toBeNull();
    expect(normaliseHost("evil.com/path")).toBeNull();
    expect(normaliseHost("[::1]")).toBeNull();
  });
});

describe("isLocalHost", () => {
  it("accepts loopback names and addresses only", () => {
    expect(isLocalHost("localhost:3197")).toBe(true);
    expect(isLocalHost("app.brandbasket.localhost")).toBe(true);
    expect(isLocalHost("127.0.0.1:3000")).toBe(true);
    expect(isLocalHost("localhost.evil.com")).toBe(false);
    expect(isLocalHost("10.0.0.1")).toBe(false);
  });
});

describe("allowsAnyLocalHost", () => {
  it("is on under next dev only", () => {
    expect(allowsAnyLocalHost({ NODE_ENV: "development" })).toBe(true);
    expect(allowsAnyLocalHost({ NODE_ENV: "production" })).toBe(false);
    expect(allowsAnyLocalHost({})).toBe(false);
  });
});

describe("isAppHost", () => {
  it("is the configured host, with or without case", () => {
    expect(isAppHost("app.brandbasket.in", production)).toBe(true);
    expect(isAppHost("APP.brandbasket.in", production)).toBe(true);
  });

  it("is not another host, nor a local one in production", () => {
    expect(isAppHost("brandbasket.in", production)).toBe(false);
    expect(isAppHost("localhost:3197", production)).toBe(false);
    expect(isAppHost(null, production)).toBe(false);
  });

  it("takes any local address in development", () => {
    expect(isAppHost("127.0.0.1:4000", development)).toBe(true);
    expect(isAppHost("evil.com", development)).toBe(false);
  });
});

describe("isAppOrigin", () => {
  it("is the configured origin exactly", () => {
    expect(isAppOrigin("https://app.brandbasket.in", "app.brandbasket.in", production)).toBe(true);
    expect(isAppOrigin("https://app.brandbasket.in.evil.com", "app.brandbasket.in", production)).toBe(false);
    expect(isAppOrigin(null, "app.brandbasket.in", production)).toBe(false);
  });

  it("takes the local address the request arrived on in development, and no other", () => {
    expect(isAppOrigin("http://127.0.0.1:4000", "127.0.0.1:4000", development)).toBe(true);
    expect(isAppOrigin("http://127.0.0.1:4000", "localhost:3197", development)).toBe(false);
    expect(isAppOrigin("http://evil.com", "evil.com", development)).toBe(false);
    expect(isAppOrigin("not a url", "localhost:3197", development)).toBe(false);
  });

  it("never takes a local address in production", () => {
    expect(isAppOrigin("http://localhost:3197", "localhost:3197", production)).toBe(false);
  });
});

describe("appOriginForHost", () => {
  it("is the configured origin for its own host, a missing host or a stranger", () => {
    expect(appOriginForHost("app.brandbasket.in", production)).toBe("https://app.brandbasket.in");
    expect(appOriginForHost(null, production)).toBe("https://app.brandbasket.in");
    expect(appOriginForHost("evil.com", development)).toBe("http://localhost:3197");
  });

  it("is the local address the request is on, in development", () => {
    expect(appOriginForHost("127.0.0.1:4000", development)).toBe("http://127.0.0.1:4000");
    expect(appOriginForHost("127.0.0.1:4000", production)).toBe("https://app.brandbasket.in");
  });
});
