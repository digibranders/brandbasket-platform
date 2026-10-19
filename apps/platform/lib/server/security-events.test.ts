import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeRateLimit, type Database } from "@brandbasket/db";
import { createAppEmailTransport, type EmailMessage } from "@brandbasket/email";
import { noteSecurityEvent, SECURITY_EVENTS } from "./security-events";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({}) as Database) }));
vi.mock("./env", () => ({ serverEnv: vi.fn(() => ({ ADMIN_ORIGIN: "https://console.brandbasket.in" })) }));
vi.mock("@brandbasket/db", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@brandbasket/email", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/email")>("@brandbasket/email");
  return { ...actual, createAppEmailTransport: vi.fn() };
});

const NOW = new Date("2026-11-01T06:00:00.000Z");
const send = vi.fn<(message: EmailMessage) => Promise<void>>(async () => undefined);
const allowed = { allowed: true, retryAfterSeconds: 0 } as Awaited<ReturnType<typeof consumeRateLimit>>;
const refused = { allowed: false, retryAfterSeconds: 60 } as Awaited<ReturnType<typeof consumeRateLimit>>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createAppEmailTransport).mockReturnValue({ send } as unknown as ReturnType<typeof createAppEmailTransport>);
});

describe("noteSecurityEvent", () => {
  it("only counts while the event is under its limit", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue(allowed);
    await noteSecurityEvent("sign_in_blocked", NOW);
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(consumeRateLimit).toHaveBeenCalledWith(expect.anything(), "security-event:sign_in_blocked", { limit: 19, windowSeconds: 3600 }, NOW);
    expect(send).not.toHaveBeenCalled();
  });

  it("emails the team the first time the limit is passed in a window, with no customer data", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(refused).mockResolvedValueOnce(allowed);
    await noteSecurityEvent("webhook_signature_invalid", NOW);
    expect(consumeRateLimit).toHaveBeenLastCalledWith(expect.anything(), "security-alert:webhook_signature_invalid", { limit: 1, windowSeconds: 3600 }, NOW);
    const message = send.mock.calls[0]?.[0];
    expect(message?.subject).toBe(`[Security] ${SECURITY_EVENTS.webhook_signature_invalid.label} (3 or more in 60 minutes)`);
    expect(message?.bodyText).toContain("https://console.brandbasket.in/access-log");
  });

  it("sends no second email in the same window", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(refused).mockResolvedValueOnce(refused);
    await noteSecurityEvent("sign_in_blocked", NOW);
    expect(send).not.toHaveBeenCalled();
  });

  it("never throws, whatever fails", async () => {
    vi.mocked(consumeRateLimit).mockRejectedValueOnce(new Error("database down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(noteSecurityEvent("sign_in_blocked", NOW)).resolves.toBeUndefined();
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(refused).mockResolvedValueOnce(allowed);
    send.mockRejectedValueOnce(new Error("mail down"));
    await expect(noteSecurityEvent("sign_in_blocked", NOW)).resolves.toBeUndefined();
  });
});
