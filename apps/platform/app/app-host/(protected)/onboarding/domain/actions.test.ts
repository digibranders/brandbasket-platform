import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string): never => {
    throw new Error(`redirect:${url}`);
  },
}));

const hoisted = vi.hoisted(() => {
  class MockDomainTakenError extends Error {}
  return { MockDomainTakenError, origins: { APP_ORIGIN: "https://app.fynix.digital", ADMIN_ORIGIN: "https://console.fynix.digital" } };
});
vi.mock("@fynix/db", () => ({ DomainTakenError: hoisted.MockDomainTakenError, savePrimaryDomain: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({
  requireCustomerAccess: vi.fn(async () => ({ tenant: { userId: "user-1", businessId: "biz-1", businessName: "Lotus Studio", role: "owner" } })),
}));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => hoisted.origins }));
vi.mock("@/lib/server/onboarding", () => ({
  // Runs the step's work and turns the errors the action describes into the problem it returns, as the real one does.
  saveOnboardingStep: vi.fn(async (_db, _tenant, _step, work, describe) => {
    try {
      return await work({ name: "tx" });
    } catch (error) {
      const problem = describe?.(error) ?? null;
      if (problem !== null) return problem;
      throw error;
    }
  }),
}));

import { savePrimaryDomain } from "@fynix/db";
// Aliased: a name that begins with "use" reads as a React hook to the lint rule, and this is a plain server action.
import { useTemporarySubdomainAction as chooseFreeAddress } from "./actions";

function form(name: string): FormData {
  const data = new FormData();
  data.append("name", name);
  return data;
}

async function run(name: string): Promise<unknown> {
  try {
    return await chooseFreeAddress({ status: "idle" }, form(name));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("redirect:")) return error.message;
    throw error;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  hoisted.origins.ADMIN_ORIGIN = "https://console.fynix.digital";
  vi.stubEnv("CLIENT_SITE_BASE_DOMAIN", "fynix.digital");
});

describe("a free address", () => {
  it("is saved under the base domain, in lower case, and the customer goes on to the review", async () => {
    expect(await run(" Lotus-Studio ")).toBe("redirect:/onboarding/review");

    expect(savePrimaryDomain).toHaveBeenCalledWith({ name: "tx" }, { hostname: "lotus-studio.fynix.digital", ownerConfirmedAt: expect.any(Date) });
  });

  it("takes the whole address when that was pasted", async () => {
    await run("lotus-studio.fynix.digital");

    expect(savePrimaryDomain).toHaveBeenCalledWith({ name: "tx" }, expect.objectContaining({ hostname: "lotus-studio.fynix.digital" }));
  });

  it("refuses the names kept for us, too short or malformed names, and saves nothing", async () => {
    for (const bad of ["app", "console", "ab", "my shop", ""]) {
      expect(await run(bad)).toMatchObject({ status: "error", field: "name" });
    }
    expect(savePrimaryDomain).not.toHaveBeenCalled();
  });

  it("refuses a name that would be one of the platform's own hosts, even one the reserved list does not know", async () => {
    hoisted.origins.ADMIN_ORIGIN = "https://portal.fynix.digital";

    expect(await run("portal")).toMatchObject({ status: "error", field: "name", message: "That name is kept for us. Choose another." });
    expect(savePrimaryDomain).not.toHaveBeenCalled();
  });

  it("says the address is taken when another business holds it, and names the address", async () => {
    vi.mocked(savePrimaryDomain).mockRejectedValue(new hoisted.MockDomainTakenError());

    expect(await run("lotus-studio")).toMatchObject({
      status: "error",
      field: "name",
      message: "lotus-studio.fynix.digital is already taken. Try another name.",
    });
  });

  it("is not offered when the deployment has no base domain", async () => {
    vi.stubEnv("CLIENT_SITE_BASE_DOMAIN", "");

    expect(await run("lotus-studio")).toMatchObject({ status: "error" });
    expect(savePrimaryDomain).not.toHaveBeenCalled();
  });
});
