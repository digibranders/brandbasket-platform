import { describe, expect, it } from "vitest";
import { createBillingProvider } from "./factory";
import { BillingConfigurationError, isRealDeployment, resolveBillingProviderName } from "./select";

const REFUSED_ON_REAL_DEPLOYMENT = /cannot run on a real deployment/;

describe("resolveBillingProviderName", () => {
  it("accepts fake explicitly on a machine that is not a real deployment", () => {
    expect(resolveBillingProviderName({ BILLING_PROVIDER: "fake", NODE_ENV: "production" })).toBe("fake");
    expect(resolveBillingProviderName({ BILLING_PROVIDER: " fake ", NODE_ENV: "development" })).toBe("fake");
  });

  it.each(["development", "test", undefined])("defaults to fake when unset and NODE_ENV is %s", (nodeEnv) => {
    expect(resolveBillingProviderName({ NODE_ENV: nodeEnv })).toBe("fake");
    expect(resolveBillingProviderName({ BILLING_PROVIDER: "  ", NODE_ENV: nodeEnv })).toBe("fake");
  });

  it.each([undefined, ""])("fails loudly in production when BILLING_PROVIDER is %j", (value) => {
    expect(() => resolveBillingProviderName({ BILLING_PROVIDER: value, NODE_ENV: "production" })).toThrow(
      new BillingConfigurationError("BILLING_PROVIDER must be set in production. Accepted values: fake, razorpay."),
    );
  });

  it.each(["stripe", "FAKE"])("refuses %s, naming what is accepted", (value) => {
    expect(() => resolveBillingProviderName({ BILLING_PROVIDER: value, NODE_ENV: "development" })).toThrow(
      `BILLING_PROVIDER "${value}" is not supported. Accepted values: fake, razorpay.`,
    );
  });

  it("keeps the local verify server working without the opt-in", () => {
    // .claude/launch.json's firstfold-verify: `next start` (NODE_ENV=production) on plain-http app.localhost.
    expect(
      resolveBillingProviderName({
        BILLING_PROVIDER: "fake",
        NODE_ENV: "production",
        APP_ORIGIN: "http://app.localhost:3100",
      }),
    ).toBe("fake");
  });

  it.each([
    ["Vercel production", { VERCEL_ENV: "production" }],
    ["an https public origin", { APP_ORIGIN: "https://app.firstfold.co" }],
    ["an https Vercel preview origin", { VERCEL_ENV: "preview", APP_ORIGIN: "https://firstfold-git-x.vercel.app" }],
    ["an origin that cannot be read", { APP_ORIGIN: "not a url" }],
  ])("refuses fake on %s", (_label, env) => {
    expect(() => resolveBillingProviderName({ BILLING_PROVIDER: "fake", NODE_ENV: "production", ...env })).toThrow(
      BillingConfigurationError,
    );
    expect(() => resolveBillingProviderName({ BILLING_PROVIDER: "fake", NODE_ENV: "production", ...env })).toThrow(
      REFUSED_ON_REAL_DEPLOYMENT,
    );
  });

  it("refuses the unset-means-fake default on a real deployment too", () => {
    expect(() =>
      resolveBillingProviderName({ NODE_ENV: "development", APP_ORIGIN: "https://app.firstfold.co" }),
    ).toThrow(REFUSED_ON_REAL_DEPLOYMENT);
  });

  it("allows fake on a real deployment only when FIRSTFOLD_ALLOW_FAKE_BILLING is exactly 1", () => {
    const real = { BILLING_PROVIDER: "fake", NODE_ENV: "production", VERCEL_ENV: "production" } as const;
    expect(resolveBillingProviderName({ ...real, FIRSTFOLD_ALLOW_FAKE_BILLING: "1" })).toBe("fake");
    for (const value of ["true", "yes", " 1", "0", ""]) {
      expect(() => resolveBillingProviderName({ ...real, FIRSTFOLD_ALLOW_FAKE_BILLING: value })).toThrow(
        REFUSED_ON_REAL_DEPLOYMENT,
      );
    }
  });
});

describe("isRealDeployment", () => {
  it.each([
    [{}, false],
    [{ VERCEL_ENV: "development" }, false],
    [{ VERCEL_ENV: "preview" }, false],
    [{ APP_ORIGIN: "http://app.localhost:3000" }, false],
    [{ APP_ORIGIN: "https://app.localhost:8443" }, false],
    [{ APP_ORIGIN: "https://localhost" }, false],
    [{ APP_ORIGIN: "https://127.0.0.1:3000" }, false],
    [{ APP_ORIGIN: "https://[::1]:3000" }, false],
    [{ APP_ORIGIN: "http://app.firstfold.co" }, false],
    [{ APP_ORIGIN: "https://app.firstfold.co" }, true],
    [{ APP_ORIGIN: "https://localhost.evil.example" }, true],
    [{ VERCEL_ENV: "production", APP_ORIGIN: "http://app.localhost:3000" }, true],
  ])("%j is real: %s", (env, expected) => {
    expect(isRealDeployment(env)).toBe(expected);
  });
});

describe("createBillingProvider", () => {
  it("builds the fake provider with the auth secret", () => {
    expect(createBillingProvider("fake", { authSecret: "s".repeat(32) }).name).toBe("fake");
  });

  it("refuses a short secret rather than signing with it", () => {
    expect(() => createBillingProvider("fake", { authSecret: "short" })).toThrow(/at least 32 characters/);
  });
});
