import { describe, expect, it } from "vitest";
import { runtimeRequirements, vercelProductionRequirements } from "./production-requirements";

describe("what a real deployment must have set to start", () => {
  it("asks the platform for its origins, its database connections, its secrets and a Brevo key", () => {
    expect(runtimeRequirements("platform")).toEqual([
      "APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL", "DATABASE_URL_STAFF", "DATABASE_URL_PUBLIC", "DATABASE_URL_PAYLOAD",
      "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "ACCOUNT_CODE_SECRET", "BREVO_API_KEY",
    ]);
  });

  it("asks for nothing that belongs to a marketing website, a team inbox, a directory, SMS or video accounts", () => {
    const required = runtimeRequirements("platform");
    for (const name of ["LEADS_API_TOKEN", "FYNIX_TEAM_EMAIL", "NEXT_PUBLIC_SITE_URL", "DIRECTORY_URL_KEY", "BOOKING_OTP_SECRET", "MSG91_AUTH_KEY", "VIMEO_ACCESS_TOKEN", "SIGNED_IN_HINT_DOMAIN", "MARKETING_ORIGIN"]) {
      expect(required).not.toContain(name);
    }
  });

  it("asks the console for the Payload connection and secret its schema needs", () => {
    expect(runtimeRequirements("admin")).toEqual(["APP_ORIGIN", "ADMIN_ORIGIN", "DATABASE_URL_STAFF", "DATABASE_URL_PAYLOAD", "BETTER_AUTH_SECRET", "PAYLOAD_SECRET", "BREVO_API_KEY"]);
  });
});

describe("what a Vercel production build must have set", () => {
  it("is the dashboard's address, the origins, the database connections and the secrets, and nothing about a website or leads", () => {
    const required = vercelProductionRequirements();
    expect(required).toEqual(expect.arrayContaining(["NEXT_PUBLIC_APP_URL", "APP_ORIGIN", "DATABASE_URL", "PAYLOAD_SECRET"]));
    for (const name of ["NEXT_PUBLIC_SITE_URL", "LEADS_API_TOKEN", "FYNIX_TEAM_EMAIL"]) expect(required).not.toContain(name);
  });
});
