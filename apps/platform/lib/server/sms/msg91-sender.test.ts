import { describe, expect, it, vi } from "vitest";
import { createMsg91Sender } from "./msg91-sender";
import { otpMessage } from "./otp-message";

vi.mock("server-only", () => ({}));

const config = { authKey: "key", templateId: "tpl-otp" } as const;
const boundConfig = {
  ...config,
  bindings: {
    app: { host: "app.fynix.digital", templateId: "tpl-app" },
    website: { host: "www.fynix.digital", templateId: "tpl-website" },
  },
} as const;

function boundBody(host: string, bindingCode = "004821"): string {
  return `004821 is your Fynix code. It expires in 10 minutes. Do not share it.\n\n@${host} #${bindingCode} Fynix`;
}

function reply(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("createMsg91Sender", () => {
  it.each([
    ["app.fynix.digital", "tpl-app"],
    ["www.fynix.digital", "tpl-website"],
  ])("selects the approved template for %s with both code substitutions", async (host, templateId) => {
    const fetchImpl = reply({ type: "success" });
    await createMsg91Sender(boundConfig, fetchImpl).send({ to: "+919876543210", body: boundBody(host), businessId: null });
    const init = vi.mocked(fetchImpl).mock.calls[0]?.[1];
    expect(JSON.parse(init?.body as string)).toEqual({
      template_id: templateId,
      short_url: "0",
      recipients: [{ mobiles: "919876543210", code: "004821", binding_code: "004821" }],
    });
  });

  it("keeps the legacy template when bindings are configured", async () => {
    const fetchImpl = reply({ type: "success" });
    await createMsg91Sender(boundConfig, fetchImpl).send({ to: "+919876543210", body: otpMessage("004821"), businessId: null });
    expect(JSON.parse(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body as string)).toMatchObject({
      template_id: config.templateId,
      recipients: [{ mobiles: "919876543210", code: "004821" }],
    });
  });

  it.each([
    boundBody("evil.test"),
    boundBody("app.fynix.digital", "123456"),
    boundBody("app.fynix.digital/path"),
  ])("refuses an unknown or malformed binding before dispatch", async (body) => {
    const fetchImpl = reply({ type: "success" });
    await expect(createMsg91Sender(boundConfig, fetchImpl).send({ to: "+919876543210", body, businessId: null })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses ambiguous template mappings for the same host", () => {
    expect(() => createMsg91Sender({ ...boundConfig, bindings: { ...boundConfig.bindings, website: { host: "app.fynix.digital", templateId: "tpl-other" } } }, reply({ type: "success" }))).toThrow(/same host/);
  });

  it("refuses an invalid configured binding host", () => {
    expect(() => createMsg91Sender({ ...config, bindings: { app: { host: "https://app.fynix.digital", templateId: "tpl-app" } } }, reply({ type: "success" }))).toThrow(/DNS host/);
  });

  it("refuses reuse of the legacy template ID for a bound message", () => {
    expect(() => createMsg91Sender({ ...config, bindings: { app: { host: "app.fynix.digital", templateId: config.templateId } } }, reply({ type: "success" }))).toThrow(/distinct template/);
  });

  it("refuses one fixed-host template ID mapped to two different hosts", () => {
    expect(() => createMsg91Sender({ ...boundConfig, bindings: { ...boundConfig.bindings, website: { host: "www.fynix.digital", templateId: boundConfig.bindings.app.templateId } } }, reply({ type: "success" }))).toThrow(/distinct template/);
  });

  it.each(["919876543210", "+01", "+91 9876543210", "+919876543210\n"])("refuses malformed destination %j before dispatch", async (to) => {
    const fetchImpl = reply({ type: "success" });
    await expect(createMsg91Sender(config, fetchImpl).send({ to, body: otpMessage("004821"), businessId: null })).rejects.toThrow(/E.164/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies rejected messages with a provider delivery error", async () => {
    await expect(createMsg91Sender(config, reply({ type: "error" })).send({ to: "+919876543210", body: otpMessage("004821"), businessId: null })).rejects.toMatchObject({ name: "Msg91DeliveryError" });
  });

  it("refuses trailing whitespace on a configured template identifier", () => {
    expect(() => createMsg91Sender({ ...config, bindings: { app: { host: "app.fynix.digital", templateId: "tpl-app\n" } } }, reply({ type: "success" }))).toThrow(/identifier/);
  });

  it.each([null, [], "success", { type: false }])("rejects malformed provider response %j with a safe error", async (body) => {
    await expect(createMsg91Sender(config, reply(body)).send({ to: "+919876543210", body: otpMessage("004821"), businessId: null })).rejects.toThrow("MSG91 did not accept the text.");
  });

  it("sends the template with only the code, to digits without the plus", async () => {
    const fetchImpl = reply({ type: "success" });
    await createMsg91Sender(config, fetchImpl).send({ to: "+919876543210", body: otpMessage("482913"), businessId: null });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(url).toBe("https://control.msg91.com/api/v5/flow");
    expect((init!.headers as Record<string, string>).authkey).toBe("key");
    expect(JSON.parse(init!.body as string)).toEqual({
      template_id: "tpl-otp",
      short_url: "0",
      recipients: [{ mobiles: "919876543210", code: "482913" }],
    });
  });

  it("refuses text that is not the registered template", async () => {
    const fetchImpl = reply({ type: "success" });
    await expect(createMsg91Sender(config, fetchImpl).send({ to: "+919876543210", body: "Hello there", businessId: null })).rejects.toThrow(/does not match it/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails without leaking the number or code when MSG91 refuses", async () => {
    const send = createMsg91Sender(config, reply({ type: "error" }, 401)).send({ to: "+919876543210", body: otpMessage("482913"), businessId: null });
    await expect(send).rejects.toThrow("MSG91 refused the text (HTTP 401).");
    await expect(createMsg91Sender(config, reply({ type: "error" })).send({ to: "+919876543210", body: otpMessage("482913"), businessId: null })).rejects.toThrow("MSG91 did not accept the text.");
  });
});
