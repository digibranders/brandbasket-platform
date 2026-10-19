import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@brandbasket/db";

vi.mock("@brandbasket/db", () => ({ recordEmail: vi.fn(async () => undefined) }));

const { recordEmail } = await import("@brandbasket/db");
const { createAppEmailTransport, createEmailDelivery, EmailConfigurationError } = await import("./brevo");
const { passwordResetEmail } = await import("./templates/password-reset");
const { signupCodeEmail } = await import("./templates/signup-code");

const db = {} as Database;
const reset = passwordResetEmail({ to: "asha@example.in", resetUrl: "https://app.fynix.digital/reset-password/TOKEN", expiresInMinutes: 60 });

beforeEach(() => vi.mocked(recordEmail).mockClear());

describe("createAppEmailTransport", () => {
  it("refuses to run on a real deployment without a Brevo key", () => {
    expect(() => createAppEmailTransport(db, { env: {}, realDeployment: true })).toThrow(EmailConfigurationError);
  });

  it("is the local development inbox without a key, keeping sign-in links readable", async () => {
    await createAppEmailTransport(db, { env: {}, realDeployment: false }).send(reset);
    expect(recordEmail).toHaveBeenCalledWith(db, expect.objectContaining({ bodyText: expect.stringContaining("TOKEN"), transport: "outbox" }));
  });

  it("delivers through Brevo on a real deployment and stores only the copy without the link", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchFn);
    try {
      await createAppEmailTransport(db, { env: { BREVO_API_KEY: "test-key" }, realDeployment: true }).send(reset);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const stored = vi.mocked(recordEmail).mock.calls[0]?.[1];
    expect(stored?.transport).toBe("brevo");
    expect(stored?.bodyText).not.toContain("TOKEN");
  });
});

describe("a sign-up code on a Fynix server", () => {
  const code = signupCodeEmail({ to: "owner@example.test", code: "482913", expiresInMinutes: 10 });

  it("goes through Brevo's transactional API as Fynix Digital, and the outbox keeps no code", async () => {
    const fetchFn = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetchFn);
    try {
      await createAppEmailTransport(db, { env: { BREVO_API_KEY: "test-key" }, realDeployment: true }).send(code);
    } finally {
      vi.unstubAllGlobals();
    }
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.headers).toMatchObject({ "api-key": "test-key" });
    const sent = JSON.parse(String(init?.body)) as { sender: unknown; to: unknown; subject: string; textContent: string };
    expect(sent).toMatchObject({
      sender: { email: "no-reply@fynix.digital", name: "Fynix Digital" },
      to: [{ email: "owner@example.test" }],
      subject: "Your Fynix Digital verification code",
    });
    expect(sent.textContent).toContain("482913");
    const stored = vi.mocked(recordEmail).mock.calls[0]?.[1];
    expect(stored?.transport).toBe("brevo");
    expect(stored?.bodyText).not.toContain("482913");
  });

  it("stays readable in the local outbox, so a developer can type it in", async () => {
    await createAppEmailTransport(db, { env: {}, realDeployment: false }).send(code);
    expect(recordEmail).toHaveBeenCalledWith(db, expect.objectContaining({ bodyText: expect.stringContaining("482913"), transport: "outbox" }));
  });

  it("is never stored in full on a deployment real customers can reach, even when Brevo fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await createAppEmailTransport(db, { env: { BREVO_API_KEY: "test-key" }, realDeployment: true }).send(code);
    } finally {
      vi.unstubAllGlobals();
      logged.mockRestore();
    }
    expect(vi.mocked(recordEmail).mock.calls[0]?.[1].bodyText).not.toContain("482913");
  });
});

describe("createEmailDelivery", () => {
  it("is null without a Brevo key", () => {
    expect(createEmailDelivery({})).toBeNull();
  });

  it("delivers through Brevo without writing the outbox", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    const delivery = createEmailDelivery({ BREVO_API_KEY: "test-key" }, { fetchFn });
    await delivery?.send(reset);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(recordEmail).not.toHaveBeenCalled();
  });
});
