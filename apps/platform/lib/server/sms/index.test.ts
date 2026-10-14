import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { createSmsSender, otpMessage, SmsProviderUnavailableError } from "./index";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));

const mockedGetStaffDb = vi.mocked(getStaffDb);

const ORIGINAL_SMS_PROVIDER = process.env.SMS_PROVIDER;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

beforeEach(() => {
  mockedGetStaffDb.mockReturnValue({} as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  if (ORIGINAL_SMS_PROVIDER === undefined) delete process.env.SMS_PROVIDER;
  else process.env.SMS_PROVIDER = ORIGINAL_SMS_PROVIDER;
  vi.stubEnv("NODE_ENV", ORIGINAL_NODE_ENV ?? "test");
});

describe("per-surface OTP configuration", () => {
  beforeEach(() => {
    for (const name of ["SMS_OTP_APP_ORIGIN", "MSG91_OTP_APP_TEMPLATE_ID", "SMS_OTP_WEBSITE_ORIGIN", "MSG91_OTP_WEBSITE_TEMPLATE_ID"]) {
      vi.stubEnv(name, "");
    }
  });

  it("defaults both surfaces to unchanged legacy messages", () => {
    expect(otpMessage("004821", "app")).toBe(otpMessage("004821"));
    expect(otpMessage("004821", "website")).toBe(otpMessage("004821"));
  });

  it.each([
    ["app", "SMS_OTP_APP_ORIGIN", "MSG91_OTP_APP_TEMPLATE_ID", "app.firstfold.io", "website"],
    ["website", "SMS_OTP_WEBSITE_ORIGIN", "MSG91_OTP_WEBSITE_TEMPLATE_ID", "www.firstfold.io", "app"],
  ] as const)("enables %s independently", (surface, originName, templateName, host, otherSurface) => {
    vi.stubEnv(originName, `https://${host}`);
    vi.stubEnv(templateName, "approved-template");
    expect(otpMessage("004821", surface)).toBe(`${otpMessage("004821")}\n\n@${host} #004821 Firstfold`);
    expect(otpMessage("004821", otherSurface)).toBe(otpMessage("004821"));
    expect(otpMessage("004821")).toBe("004821 is your Firstfold code. It expires in 10 minutes. Do not share it.");
  });

  it.each([
    ["app", "SMS_OTP_APP_ORIGIN", "https://app.firstfold.io", "website"],
    ["app", "MSG91_OTP_APP_TEMPLATE_ID", "approved-template", "website"],
    ["website", "SMS_OTP_WEBSITE_ORIGIN", "https://www.firstfold.io", "app"],
    ["website", "MSG91_OTP_WEBSITE_TEMPLATE_ID", "approved-template", "app"],
  ] as const)("refuses an incomplete %s pair with only %s", (surface, name, value, otherSurface) => {
    vi.stubEnv(name, value);
    expect(() => otpMessage("004821", surface)).toThrow(/set together/);
    expect(otpMessage("004821", otherSurface)).toBe(otpMessage("004821"));
  });

  it.each([
    ["app", "SMS_OTP_APP_ORIGIN", "MSG91_OTP_APP_TEMPLATE_ID", "app.firstfold.io"],
    ["website", "SMS_OTP_WEBSITE_ORIGIN", "MSG91_OTP_WEBSITE_TEMPLATE_ID", "www.firstfold.io"],
  ] as const)("wires the independent %s pair into MSG91", async (surface, originName, templateName, host) => {
    vi.stubEnv("SMS_PROVIDER", "msg91");
    vi.stubEnv("MSG91_AUTH_KEY", "test-key");
    vi.stubEnv("MSG91_TEMPLATE_ID", "legacy-template");
    vi.stubEnv(originName, `https://${host}/`);
    vi.stubEnv(templateName, "approved-template");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ type: "success" })));
    vi.stubGlobal("fetch", fetchImpl);
    await createSmsSender().send({ to: "+919876543210", body: otpMessage("004821", surface), businessId: null });
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toEqual({
      template_id: "approved-template",
      short_url: "0",
      recipients: [{ mobiles: "919876543210", code: "004821", binding_code: "004821" }],
    });
  });

  it.each(["http://app.firstfold.io", "https://localhost", "https://127.0.0.1", "https://app.firstfold.io:8443", "https://app.firstfold.io:443", "https://app.firstfold.io/path", "https://user@app.firstfold.io", "https://app.firstfold.io?x=1", "https://app.firstfold.io#x", "https://APP.firstfold.io", "https://app.firstfold.io.", "https://app.firstfold.io\\evil", "https://app.firstfold.io\n"])("rejects noncanonical secure origin %j", (origin) => {
    vi.stubEnv("SMS_OTP_APP_ORIGIN", origin);
    vi.stubEnv("MSG91_OTP_APP_TEMPLATE_ID", "approved-template");
    expect(() => otpMessage("004821", "app")).toThrow(/HTTPS DNS origin/);
  });
});

describe("createSmsSender", () => {
  it("returns the outbox sender by default, when SMS_PROVIDER is unset", () => {
    delete process.env.SMS_PROVIDER;
    const sender = createSmsSender();
    expect(sender).toBeDefined();
    expect(typeof sender.send).toBe("function");
  });

  it("returns the outbox sender when SMS_PROVIDER=outbox", () => {
    process.env.SMS_PROVIDER = "outbox";
    const sender = createSmsSender();
    expect(typeof sender.send).toBe("function");
  });

  it("throws a clear configuration error naming the supported values for any other provider", () => {
    process.env.SMS_PROVIDER = "twilio";
    expect(() => createSmsSender()).toThrow(/Unknown SMS_PROVIDER "twilio"/);
    expect(() => createSmsSender()).toThrow(/outbox/);
  });

  it("stays lenient outside production: the outbox is still returned when NODE_ENV is development or test", () => {
    process.env.SMS_PROVIDER = "outbox";
    vi.stubEnv("NODE_ENV", "development");
    expect(() => createSmsSender()).not.toThrow();
    vi.stubEnv("NODE_ENV", "test");
    expect(() => createSmsSender()).not.toThrow();
  });

  it("refuses the outbox in production with SmsProviderUnavailableError", () => {
    process.env.SMS_PROVIDER = "outbox";
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createSmsSender()).toThrow(SmsProviderUnavailableError);
  });

  it("still throws the unknown-provider error in production for a real provider name, not SmsProviderUnavailableError", () => {
    process.env.SMS_PROVIDER = "twilio";
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createSmsSender()).toThrow(/Unknown SMS_PROVIDER "twilio"/);
  });
});
