import { describe, expect, it } from "vitest";
import { assertRuntimeEnvironment, RuntimeEnvironmentError } from "./runtime-environment";

const REAL = { APP_ORIGIN: "https://app.fynix.digital", BREVO_API_KEY: "k", DATABASE_URL: "postgres://x" };

describe("assertRuntimeEnvironment", () => {
  it("checks nothing on a local machine", () => {
    expect(() => assertRuntimeEnvironment({ APP_ORIGIN: "http://app.localhost:3001" }, ["BREVO_API_KEY"])).not.toThrow();
  });

  it("names every missing variable on a real deployment", () => {
    expect(() => assertRuntimeEnvironment({ APP_ORIGIN: REAL.APP_ORIGIN }, ["BREVO_API_KEY", "DATABASE_URL"])).toThrow(
      /BREVO_API_KEY, DATABASE_URL/,
    );
  });

  it("refuses the emailed code bypass on a real deployment", () => {
    expect(() => assertRuntimeEnvironment({ ...REAL, EMAIL_CODE_BYPASS: "true" }, ["BREVO_API_KEY"])).toThrow(RuntimeEnvironmentError);
    expect(() => assertRuntimeEnvironment({ ...REAL, EMAIL_CODE_BYPASS: "true" }, ["BREVO_API_KEY"])).toThrow(/EMAIL_CODE_BYPASS/);
  });

  it("passes a complete real deployment", () => {
    expect(() => assertRuntimeEnvironment(REAL, ["BREVO_API_KEY", "DATABASE_URL"])).not.toThrow();
  });

  it("checks nothing during next build, whose env file holds placeholders only", () => {
    expect(() =>
      assertRuntimeEnvironment({ APP_ORIGIN: REAL.APP_ORIGIN, NEXT_PHASE: "phase-production-build" }, ["BREVO_API_KEY"]),
    ).not.toThrow();
  });
});
