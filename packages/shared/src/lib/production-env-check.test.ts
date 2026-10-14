import { describe, expect, it } from "vitest";
import { checkProductionEnv, parseEnvFile } from "./production-env-check";

const SECRET = "a".repeat(40);
const PLATFORM = {
  APP_ORIGIN: "https://app.fynix.digital",
  ADMIN_ORIGIN: "https://console.fynix.digital",
  NEXT_PUBLIC_APP_URL: "https://app.fynix.digital",
  DATABASE_URL: "postgresql://fynix_app:pw@localhost:5432/fynix_platform",
  DATABASE_URL_STAFF: "postgresql://fynix_staff:pw@localhost:5432/fynix_platform",
  DATABASE_URL_PUBLIC: "postgresql://fynix_public:pw@localhost:5432/fynix_platform",
  DATABASE_URL_PAYLOAD: "postgresql://fynix_cms:pw@localhost:5432/fynix_platform_payload",
  BETTER_AUTH_SECRET: SECRET,
  PAYLOAD_SECRET: "b".repeat(40),
  ACCOUNT_CODE_SECRET: "c".repeat(40),
  BREVO_API_KEY: "xkeysib-test",
  BILLING_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: "rzp_live_abc",
  RAZORPAY_KEY_SECRET: "secret",
  RAZORPAY_WEBHOOK_SECRET: "d".repeat(40),
  FYNIX_MEDIA_ROOT: "/srv/fynix/media",
} as const;
const ADMIN = {
  APP_ORIGIN: PLATFORM.APP_ORIGIN,
  ADMIN_ORIGIN: PLATFORM.ADMIN_ORIGIN,
  DATABASE_URL_STAFF: PLATFORM.DATABASE_URL_STAFF,
  DATABASE_URL_PAYLOAD: PLATFORM.DATABASE_URL_PAYLOAD,
  BETTER_AUTH_SECRET: SECRET,
  PAYLOAD_SECRET: PLATFORM.PAYLOAD_SECRET,
  BREVO_API_KEY: PLATFORM.BREVO_API_KEY,
  BILLING_PROVIDER: "razorpay",
  RAZORPAY_KEY_ID: PLATFORM.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: PLATFORM.RAZORPAY_KEY_SECRET,
  FYNIX_MEDIA_ROOT: PLATFORM.FYNIX_MEDIA_ROOT,
} as const;

const problems = (platform: Record<string, string>, admin: Record<string, string>): readonly string[] => checkProductionEnv({ platform, admin }).errors;

describe("parseEnvFile", () => {
  it("reads KEY=value lines, ignoring comments, blanks, an export prefix and surrounding quotes", () => {
    expect(parseEnvFile(`# a comment\n\nA=1\nexport B="two words"\nC='x'\nD=\n  E = 5 \nbad line\nF=a=b\n`)).toEqual({ A: "1", B: "two words", C: "x", D: "", E: "5", F: "a=b" });
  });
});

describe("checkProductionEnv", () => {
  it("passes a complete Fynix pair of files", () => {
    expect(checkProductionEnv({ platform: PLATFORM, admin: ADMIN })).toEqual({ errors: [], warnings: [] });
  });

  it("names every required setting that is missing or blank, in either file", () => {
    const { ACCOUNT_CODE_SECRET: _a, ...platform } = PLATFORM;
    const errors = problems({ ...platform, BREVO_API_KEY: "  " }, { ...ADMIN, DATABASE_URL_PAYLOAD: "" });
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("platform: ACCOUNT_CODE_SECRET"),
        expect.stringContaining("platform: BREVO_API_KEY"),
        expect.stringContaining("admin: DATABASE_URL_PAYLOAD"),
      ]),
    );
  });

  it("refuses a secret under 32 characters without printing it", () => {
    const errors = problems({ ...PLATFORM, ACCOUNT_CODE_SECRET: "short-secret" }, ADMIN);
    expect(errors.join("\n")).toMatch(/ACCOUNT_CODE_SECRET.*32/);
    expect(errors.join("\n")).not.toContain("short-secret");
  });

  it("refuses secrets that differ between the two apps, since both read the same sessions and Payload data", () => {
    const errors = problems(PLATFORM, { ...ADMIN, BETTER_AUTH_SECRET: "z".repeat(40), PAYLOAD_SECRET: "y".repeat(40) });
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining("BETTER_AUTH_SECRET"), expect.stringContaining("PAYLOAD_SECRET")]));
    expect(errors.join("\n")).not.toContain("z".repeat(40));
  });

  it("requires https origins with no path, the same in both files, and a public app URL that matches APP_ORIGIN", () => {
    expect(problems({ ...PLATFORM, APP_ORIGIN: "http://app.fynix.digital" }, { ...ADMIN, APP_ORIGIN: "http://app.fynix.digital" }).join("\n")).toMatch(/APP_ORIGIN.*https/);
    expect(problems({ ...PLATFORM, ADMIN_ORIGIN: "https://console.fynix.digital/admin" }, ADMIN).join("\n")).toMatch(/ADMIN_ORIGIN.*path/);
    expect(problems(PLATFORM, { ...ADMIN, ADMIN_ORIGIN: "https://other.fynix.digital" }).join("\n")).toMatch(/ADMIN_ORIGIN.*differ/);
    expect(problems({ ...PLATFORM, NEXT_PUBLIC_APP_URL: "https://elsewhere.example" }, ADMIN).join("\n")).toMatch(/NEXT_PUBLIC_APP_URL/);
  });

  it("refuses the emailed code bypass and the fake billing allowance, in either file", () => {
    for (const name of ["EMAIL_CODE_BYPASS", "FYNIX_ALLOW_FAKE_BILLING"]) {
      expect(problems({ ...PLATFORM, [name]: "true" }, ADMIN).join("\n")).toContain(name);
      expect(problems(PLATFORM, { ...ADMIN, [name]: "1" }).join("\n")).toContain(name);
    }
  });

  it("wants real billing: razorpay with both keys in both files, and the webhook secret in the platform's", () => {
    expect(problems({ ...PLATFORM, BILLING_PROVIDER: "fake" }, ADMIN).join("\n")).toMatch(/BILLING_PROVIDER/);
    const { RAZORPAY_WEBHOOK_SECRET: _w, ...noWebhook } = PLATFORM;
    expect(problems(noWebhook, ADMIN).join("\n")).toContain("RAZORPAY_WEBHOOK_SECRET");
    expect(problems(PLATFORM, { ...ADMIN, RAZORPAY_KEY_SECRET: "" }).join("\n")).toMatch(/admin: RAZORPAY_KEY_SECRET/);
  });

  it("warns, rather than refuses, about things worth a second look", () => {
    const result = checkProductionEnv({
      platform: { ...PLATFORM, RAZORPAY_KEY_ID: "rzp_test_abc", DATABASE_URL: "postgresql://someone_else:pw@localhost:5432/fynix_platform", FYNIX_MEDIA_ROOT: "" },
      admin: { ...ADMIN, RAZORPAY_KEY_ID: "rzp_test_abc", FYNIX_MEDIA_ROOT: "" },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join("\n")).toMatch(/rzp_test_/);
    expect(result.warnings.join("\n")).toMatch(/DATABASE_URL.*fynix_app/);
    expect(result.warnings.join("\n")).toMatch(/FYNIX_MEDIA_ROOT/);
  });

  it("warns when a database is not on this machine, since the plan is Postgres on the droplet", () => {
    const result = checkProductionEnv({ platform: { ...PLATFORM, DATABASE_URL: "postgresql://fynix_app:pw@db.example.com:5432/fynix_platform" }, admin: ADMIN });
    expect(result.warnings.join("\n")).toMatch(/not on this machine/);
  });
});
