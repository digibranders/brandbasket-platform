import { parse } from "dotenv";
import { describe, expect, it } from "vitest";
import { buildAdminEnvFile, buildLocalEnvFile } from "./local-env-template";

const secrets = {
  osUser: "sid ahmed",
  appPassword: "app-pass",
  staffPassword: "staff-pass",
  publicPassword: "public-pass",
  cmsPassword: "cms-pass",
  authSecret: "c2VjcmV0K3dpdGgvc2xhc2g=",
  leadsApiToken: "leads-token",
  payloadSecret: "payload-secret",
};

describe("buildLocalEnvFile", () => {
  const env: Record<string, string> = parse(buildLocalEnvFile(secrets));

  it("connects migrations as the local superuser, URL-encoding the OS user name", () => {
    expect(env.DATABASE_URL_OWNER).toBe("postgresql://sid%20ahmed@localhost:5432/fynix_platform");
    expect(env.DATABASE_URL_OWNER_TEST).toBe("postgresql://sid%20ahmed@localhost:5432/fynix_platform_test");
  });

  it("connects the runtime as the application roles with their passwords", () => {
    expect(env.DATABASE_URL).toBe("postgresql://fynix_app:app-pass@localhost:5432/fynix_platform");
    expect(env.DATABASE_URL_STAFF).toBe("postgresql://fynix_staff:staff-pass@localhost:5432/fynix_platform");
    expect(env.DATABASE_URL_TEST).toBe("postgresql://fynix_app:app-pass@localhost:5432/fynix_platform_test");
    expect(env.DATABASE_URL_STAFF_TEST).toBe("postgresql://fynix_staff:staff-pass@localhost:5432/fynix_platform_test");
    expect(env.FYNIX_APP_PASSWORD).toBe("app-pass");
    expect(env.FYNIX_STAFF_PASSWORD).toBe("staff-pass");
    expect(env.DATABASE_URL_PUBLIC).toBe("postgresql://fynix_public:public-pass@localhost:5432/fynix_platform");
    expect(env.DATABASE_URL_PUBLIC_TEST).toBe("postgresql://fynix_public:public-pass@localhost:5432/fynix_platform_test");
    expect(env.FYNIX_PUBLIC_PASSWORD).toBe("public-pass");
  });

  it("includes the auth secret and each app's own local origin", () => {
    expect(env.BETTER_AUTH_SECRET).toBe(secrets.authSecret);
    expect(env.APP_ORIGIN).toBe("http://app.localhost:3001");
    // The staff console is its own app on its own port since the split.
    expect(env.ADMIN_ORIGIN).toBe("http://admin.localhost:3003");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://app.localhost:3001");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000");
    expect(env.MARKETING_ORIGIN).toBeUndefined();
  });

  it("includes the Payload connection, which both apps read", () => {
    expect(env.DATABASE_URL_PAYLOAD).toBe("postgresql://fynix_cms:cms-pass@localhost:5432/fynix_platform_payload");
    expect(env.FYNIX_CMS_PASSWORD).toBe("cms-pass");
    expect(env.PAYLOAD_SECRET).toBe("payload-secret");
  });

  it("includes the lead intake token and the team inbox", () => {
    expect(env.LEADS_API_TOKEN).toBe("leads-token");
    expect(env.FYNIX_TEAM_EMAIL).toBe("team@example.com");
  });

  it("URL-encodes role passwords containing reserved URL characters, and dotenv can parse the result", () => {
    const encodedEnv: Record<string, string> = parse(
      buildLocalEnvFile({ ...secrets, appPassword: "p@ss/w:rd" }),
    );

    expect(encodedEnv.DATABASE_URL).toBe("postgresql://fynix_app:p%40ss%2Fw%3Ard@localhost:5432/fynix_platform");
    expect(encodedEnv.FYNIX_APP_PASSWORD).toBe("p@ss/w:rd");
    expect(decodeURIComponent(new URL(encodedEnv.DATABASE_URL ?? "").password)).toBe("p@ss/w:rd");
  });
});

describe("buildAdminEnvFile", () => {
  const env: Record<string, string> = parse(buildAdminEnvFile(secrets));

  it("gives the console everything apps/admin/lib/server/env.ts requires", () => {
    expect(env.DATABASE_URL_STAFF).toBe("postgresql://fynix_staff:staff-pass@localhost:5432/fynix_platform");
    expect(env.DATABASE_URL_PAYLOAD).toBe("postgresql://fynix_cms:cms-pass@localhost:5432/fynix_platform_payload");
    expect(env.PAYLOAD_SECRET).toBe("payload-secret");
    expect(env.BETTER_AUTH_SECRET).toBe(secrets.authSecret);
    expect(env.ADMIN_ORIGIN).toBe("http://admin.localhost:3003");
    expect(env.APP_ORIGIN).toBe("http://app.localhost:3001");
  });

  /**
   * The console holds neither the customer's row-level-security-bound connection nor the insert-only lead
   * connection. Writing them into its .env.local would hand it exactly what the split took away.
   */
  it("withholds the connections the console has no reason to hold", () => {
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_URL_PUBLIC).toBeUndefined();
    expect(env.DATABASE_URL_OWNER).toBeUndefined();
    expect(env.LEADS_API_TOKEN).toBeUndefined();
  });

  it("shares the auth secret with the platform, so a staff session verifies the same way in both", () => {
    const platform: Record<string, string> = parse(buildLocalEnvFile(secrets));
    expect(env.BETTER_AUTH_SECRET).toBe(platform.BETTER_AUTH_SECRET);
  });
});
