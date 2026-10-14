import { afterEach, describe, expect, it, vi } from "vitest";
import { realDeployment } from "./email";

vi.mock("server-only", () => ({}));

afterEach(() => vi.unstubAllEnvs());

describe("realDeployment", () => {
  it("is false for the local dashboard", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("APP_ORIGIN", "http://app.localhost:3001");
    expect(realDeployment()).toBe(false);
  });

  it("is true for the dashboard served over https on a public host", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("APP_ORIGIN", "https://app.firstfold.io");
    expect(realDeployment()).toBe(true);
  });
});
