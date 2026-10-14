import { describe, expect, it } from "vitest";
import { deploymentBrandId, deploymentBrandName, deploymentBrandShortName, clientBrandName, ambientBrandId } from "./deployment-brand";

describe("the deployment's brand", () => {
  it("is Firstfold when PLATFORM_BRAND is unset or blank", () => {
    expect(deploymentBrandName({})).toBe("Firstfold");
    expect(deploymentBrandName({ PLATFORM_BRAND: "  " })).toBe("Firstfold");
  });

  it("is Fynix Digital on a Fynix server, whatever the case", () => {
    expect(deploymentBrandName({ PLATFORM_BRAND: "fynix" })).toBe("Fynix Digital");
    expect(deploymentBrandId({ PLATFORM_BRAND: " Fynix " })).toBe("fynix");
  });

  it("refuses a name it does not know", () => {
    expect(() => deploymentBrandName({ PLATFORM_BRAND: "fynx" })).toThrow(/PLATFORM_BRAND/);
  });
});

describe("the deployment's short brand name", () => {
  it("is Firstfold unset, and Fynix on a Fynix server", () => {
    expect(deploymentBrandShortName({})).toBe("Firstfold");
    expect(deploymentBrandShortName({ PLATFORM_BRAND: "fynix" })).toBe("Fynix");
  });
});

describe("the brand a process is, with nothing passed in", () => {
  function withEnv(values: Record<string, string | undefined>, work: () => void): void {
    const before = { public: process.env.NEXT_PUBLIC_PLATFORM_BRAND, server: process.env.PLATFORM_BRAND };
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      work();
    } finally {
      for (const [key, value] of [["NEXT_PUBLIC_PLATFORM_BRAND", before.public], ["PLATFORM_BRAND", before.server]] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("is Firstfold with neither set", () => {
    withEnv({ NEXT_PUBLIC_PLATFORM_BRAND: undefined, PLATFORM_BRAND: undefined }, () => {
      expect(ambientBrandId()).toBe("firstfold");
      expect(clientBrandName()).toBe("Firstfold");
    });
  });

  it("follows NEXT_PUBLIC_PLATFORM_BRAND, which the build fills from PLATFORM_BRAND, and falls back to PLATFORM_BRAND", () => {
    withEnv({ NEXT_PUBLIC_PLATFORM_BRAND: "fynix", PLATFORM_BRAND: undefined }, () => expect(clientBrandName()).toBe("Fynix Digital"));
    withEnv({ NEXT_PUBLIC_PLATFORM_BRAND: "", PLATFORM_BRAND: "fynix" }, () => expect(ambientBrandId()).toBe("fynix"));
  });
});
