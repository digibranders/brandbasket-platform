import { describe, expect, it, vi } from "vitest";
import { BrevoDeliveryError, createAppEmailTransport, createBrevoTransport, createDualTransport, createEmailDelivery } from "./brevo";
import type { EmailMessage } from "./message";

const sampleMessage: EmailMessage = {
  to: "support@brandbasket.in",
  subject: "[New Bug] Broken button (SUP-001)",
  template: "support-ticket-alert",
  bodyText: "A customer reported a broken button.",
  bodyHtml: "<p>A customer reported a broken button.</p>",
};

describe("createBrevoTransport", () => {
  it("sends payload to Brevo API with api-key header", async () => {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    const mockFetch = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return new Response(JSON.stringify({ messageId: "<test-msg-123>" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const transport = createBrevoTransport({
      apiKey: "test-api-key",
      defaultSender: { email: "no-reply@brandbasket.in", name: "Brandbasket Alerts" },
      fetchFn: mockFetch,
    });

    await transport.send(sampleMessage);

    expect(capturedUrl).toBe("https://api.brevo.com/v3/smtp/email");
    expect(capturedOptions?.method).toBe("POST");
    expect((capturedOptions?.headers as Record<string, string>)["api-key"]).toBe("test-api-key");

    const body = JSON.parse(capturedOptions?.body as string);
    expect(body.sender).toEqual({ email: "no-reply@brandbasket.in", name: "Brandbasket Alerts" });
    expect(body.to).toEqual([{ email: "support@brandbasket.in" }]);
    expect(body.subject).toBe(sampleMessage.subject);
    expect(body.htmlContent).toBe(sampleMessage.bodyHtml);
    expect(body.textContent).toBe(sampleMessage.bodyText);
  });

  it("throws BrevoDeliveryError on API error response", async () => {
    const mockFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ code: "invalid_parameter", message: "Invalid email" }), {
        status: 400,
      });
    }) as unknown as typeof fetch;

    const transport = createBrevoTransport({
      apiKey: "test-api-key",
      fetchFn: mockFetch,
    });

    await expect(transport.send(sampleMessage)).rejects.toThrow(BrevoDeliveryError);
  });

  it("supports replyTo header in Brevo payload", async () => {
    let capturedOptions: RequestInit | undefined;
    const mockFetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      capturedOptions = options;
      return new Response(JSON.stringify({ messageId: "<test-msg-456>" }), { status: 200 });
    }) as unknown as typeof fetch;

    const transport = createBrevoTransport({
      apiKey: "test-key",
      replyTo: { email: "support@brandbasket.in", name: "Support Team" },
      fetchFn: mockFetch,
    });

    await transport.send(sampleMessage);

    const body = JSON.parse(capturedOptions?.body as string);
    expect(body.replyTo).toEqual({ email: "support@brandbasket.in", name: "Support Team" });
  });
});

describe("createBrevoTransport timeout", () => {
  it("passes an abort signal so a slow delivery is cut off", async () => {
    let signal: AbortSignal | null | undefined;
    const mockFetch = vi.fn(async (_url: unknown, options?: RequestInit) => {
      signal = options?.signal;
      return new Response("{}", { status: 201 });
    }) as unknown as typeof fetch;
    await createBrevoTransport({ apiKey: "k", fetchFn: mockFetch }).send(sampleMessage);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
  });

  it("rejects when the request outlives the timeout", async () => {
    const hang = vi.fn((_url: unknown, options?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(options.signal?.reason));
      }),
    ) as unknown as typeof fetch;
    await expect(createBrevoTransport({ apiKey: "k", fetchFn: hang, timeoutMs: 20 }).send(sampleMessage)).rejects.toThrow();
  });
});

describe("createDualTransport", () => {
  it("calls brevo send and writes to database outbox", async () => {
    const brevoSend = vi.fn(async () => {});
    const mockBrevoTransport = { send: brevoSend };

    const mockDb = {
      insert: vi.fn(() => ({
        values: vi.fn(async () => {}),
      })),
    } as unknown as Parameters<typeof createDualTransport>[1];

    const dual = createDualTransport(mockBrevoTransport, mockDb);
    await dual.send(sampleMessage);

    expect(brevoSend).toHaveBeenCalledWith(sampleMessage);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  function outboxDb(): { db: Parameters<typeof createDualTransport>[1]; rows: Record<string, unknown>[] } {
    const rows: Record<string, unknown>[] = [];
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn(async (row: Record<string, unknown>) => {
          rows.push(row);
        }),
      })),
    } as unknown as Parameters<typeof createDualTransport>[1];
    return { db, rows };
  }

  it("records the redacted copy, not the full body, but sends the full body to Brevo", async () => {
    const { db, rows } = outboxDb();
    const brevoSend = vi.fn(async () => {});
    const message: EmailMessage = {
      ...sampleMessage,
      bodyText: "Customer wrote: my card is 4242",
      outboxCopy: { subject: "Support request SUP-001", bodyText: "Reference SUP-001", bodyHtml: "<p>Reference SUP-001</p>" },
    };
    await createDualTransport({ send: brevoSend }, db).send(message);
    expect(brevoSend).toHaveBeenCalledWith(message);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ subject: "Support request SUP-001", bodyText: "Reference SUP-001", transport: "brevo", toAddress: "support@brandbasket.in" });
    expect(JSON.stringify(rows)).not.toContain("4242");
  });

  it("does not fail when Brevo fails, and records the message as undelivered in the outbox", async () => {
    const { db, rows } = outboxDb();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(createDualTransport({ send: async () => { throw new BrevoDeliveryError("down", 503, "") }}, db).send(sampleMessage)).resolves.toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ transport: "outbox", bodyText: sampleMessage.bodyText });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("throws only when both Brevo and the outbox fail", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = { insert: vi.fn(() => ({ values: vi.fn(async () => { throw new Error("no insert grant"); }) })) } as unknown as Parameters<typeof createDualTransport>[1];
    await expect(createDualTransport({ send: async () => { throw new Error("down"); } }, db).send(sampleMessage)).rejects.toThrow("no insert grant");
    error.mockRestore();
  });
});

describe("createAppEmailTransport", () => {
  it("uses Brevo transport when BREVO_API_KEY is provided", async () => {
    const mockDb = {} as Parameters<typeof createDualTransport>[1];
    const transport = createAppEmailTransport(mockDb, {
      env: {
        BREVO_API_KEY: "test-key",
        ALERTS_FROM_EMAIL: "no-reply@brandbasket.in",
      },
    });
    expect(transport).toBeDefined();
    expect(typeof transport.send).toBe("function");
  });

  it("falls back to outbox transport when BREVO_API_KEY is not set", async () => {
    const mockDb = {
      insert: vi.fn(() => ({ values: vi.fn(async () => {}) })),
    } as unknown as Parameters<typeof createDualTransport>[1];

    const transport = createAppEmailTransport(mockDb, {
      env: {},
    });
    expect(transport).toBeDefined();
    await transport.send(sampleMessage);
    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("falls back to the outbox when the key is blank, never calling Brevo", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const mockDb = { insert: vi.fn(() => ({ values: vi.fn(async () => {}) })) } as unknown as Parameters<typeof createDualTransport>[1];
    await createAppEmailTransport(mockDb, { env: { BREVO_API_KEY: "   " } }).send(sampleMessage);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("stores only the redacted copy in the outbox when no Brevo key is set", async () => {
    const values = vi.fn(async (_row: Record<string, unknown>) => {});
    const mockDb = { insert: vi.fn(() => ({ values })) } as unknown as Parameters<typeof createDualTransport>[1];
    await createAppEmailTransport(mockDb, { env: {} }).send({
      ...sampleMessage,
      bodyText: "full customer text",
      outboxCopy: { subject: "s", bodyText: "redacted", bodyHtml: "<p>redacted</p>" },
    });
    expect(values.mock.calls[0]?.[0]).toMatchObject({ bodyText: "redacted", transport: "outbox" });
  });
});

describe("who mail comes from", () => {
  async function sentBody(env: Record<string, string>): Promise<{ sender: unknown; replyTo: unknown }> {
    let body: { sender: unknown; replyTo: unknown } = { sender: null, replyTo: null };
    const fetchFn = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => {
      body = JSON.parse(options?.body as string);
      return new Response(JSON.stringify({ messageId: "<m>" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    await createEmailDelivery({ BREVO_API_KEY: "key", ...env }, { fetchFn })?.send(sampleMessage);
    return body;
  }

  it("is Brandbasket <no-reply@brandbasket.in> with replies to support@brandbasket.in", async () => {
    const body = await sentBody({});
    expect(body.sender).toEqual({ email: "no-reply@brandbasket.in", name: "Brandbasket" });
    expect(body.replyTo).toEqual({ email: "support@brandbasket.in", name: "Brandbasket Support" });
  });

  it("sends Brandbasket mail from BRANDBASKET_MAIL_FROM, named Brandbasket", async () => {
    const body = await sentBody({ BRANDBASKET_MAIL_FROM: "hello@mail.brandbasket.in" });
    expect(body.sender).toEqual({ email: "hello@mail.brandbasket.in", name: "Brandbasket" });
  });

  it("ignores a blank BRANDBASKET_MAIL_FROM", async () => {
    expect((await sentBody({ BRANDBASKET_MAIL_FROM: "  " })).sender).toEqual({ email: "no-reply@brandbasket.in", name: "Brandbasket" });
  });

  it("lets the environment's own addresses win on either", async () => {
    const body = await sentBody({ ALERTS_FROM_EMAIL: "no-reply@brandbasket.in", ALERTS_FROM_NAME: "Brandbasket", SUPPORT_ALERT_EMAIL: "care@brandbasket.in" });
    expect(body.sender).toEqual({ email: "no-reply@brandbasket.in", name: "Brandbasket" });
    expect(body.replyTo).toMatchObject({ email: "care@brandbasket.in" });
  });
});
