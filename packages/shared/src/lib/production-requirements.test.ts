import { describe, expect, it } from "vitest";
import { runtimeRequirements, vercelProductionRequirements } from "./production-requirements";

const FIRSTFOLD = {};
const FYNIX = { PLATFORM_BRAND: "fynix" };

describe("what a real deployment must have set to start", () => {
  it("is what Firstfold's platform has always needed, with no brand set", () => {
    expect(runtimeRequirements("platform", FIRSTFOLD)).toEqual([
      "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD",
      "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "LEADS_API_TOKEN", "FIRSTFOLD_TEAM_EMAIL", "BREVO_API_KEY",
    ]);
  });

  it("asks a Fynix platform for nothing that belongs to Firstfold's website or team inbox, and for its own code secret", () => {
    const required = runtimeRequirements("platform", FYNIX);
    expect(required).toEqual(expect.arrayContaining(["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD", "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "ACCOUNT_CODE_SECRET", "BREVO_API_KEY"]));
    for (const name of ["LEADS_API_TOKEN", "FIRSTFOLD_TEAM_EMAIL", "NEXT_PUBLIC_SITE_URL", "DIRECTORY_URL_KEY", "BOOKING_OTP_SECRET", "MSG91_AUTH_KEY", "VIMEO_ACCESS_TOKEN", "SIGNED_IN_HINT_DOMAIN", "MARKETING_ORIGIN"]) {
      expect(required).not.toContain(name);
    }
  });

  it("keeps the console's list, and adds the Payload connection its schema needs on Fynix", () => {
    expect(runtimeRequirements("admin", FIRSTFOLD)).toEqual(["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_STAFF", "BETTER_AUTH_SECRET", "BREVO_API_KEY"]);
    expect(runtimeRequirements("admin", FYNIX)).toEqual(["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_STAFF", "DATABASE_URL_PAYLOAD", "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "BREVO_API_KEY"]);
  });

  it("refuses a brand it does not know, rather than guessing which list to hold a deployment to", () => {
    expect(() => runtimeRequirements("platform", { PLATFORM_BRAND: "fynx" })).toThrow(/PLATFORM_BRAND/);
  });
});

describe("what a Vercel production build must have set", () => {
  it("is as before for Firstfold, and without the website and lead settings for Fynix", () => {
    expect(vercelProductionRequirements(FIRSTFOLD)).toEqual(expect.arrayContaining(["NEXT_PUBLIC_SITE_URL", "LEADS_API_TOKEN", "FIRSTFOLD_TEAM_EMAIL", "DATABASE_URL_PUBLIC"]));
    const fynix = vercelProductionRequirements(FYNIX);
    expect(fynix).toEqual(expect.arrayContaining(["NEXT_PUBLIC_APP_URL", "APP_ORIGIN", "DATABASE_URL", "PAYLOAD_SECRET"]));
    for (const name of ["NEXT_PUBLIC_SITE_URL", "LEADS_API_TOKEN", "FIRSTFOLD_TEAM_EMAIL"]) expect(fynix).not.toContain(name);
  });
});
