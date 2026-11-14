// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/entry/server/signup-reminder-job", () => ({
  processSignupReminders: vi.fn(),
  signupReminderToken: vi.fn(),
}));

import { processSignupReminders, signupReminderToken } from "@/features/entry/server/signup-reminder-job";
import { POST } from "./route";

const TOKEN = "t".repeat(40);
const call = (authorization?: string) =>
  POST(
    new Request("http://localhost/api/internal/send-signup-reminders", {
      method: "POST",
      headers: authorization === undefined ? {} : { authorization },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/internal/send-signup-reminders", () => {
  it("answers 503 when the secret is not configured, and checks nothing", async () => {
    vi.mocked(signupReminderToken).mockReturnValue(null);
    const res = await call(`Bearer ${TOKEN}`);
    expect(res.status).toBe(503);
    expect(processSignupReminders).not.toHaveBeenCalled();
  });

  it("answers 401 for a missing or wrong secret, and checks nothing", async () => {
    vi.mocked(signupReminderToken).mockReturnValue(TOKEN);
    expect((await call()).status).toBe(401);
    expect((await call(`Bearer ${"x".repeat(40)}`)).status).toBe(401);
    expect(processSignupReminders).not.toHaveBeenCalled();
  });

  it("runs the reminder job and returns report, with 502 when any failed", async () => {
    vi.mocked(signupReminderToken).mockReturnValue(TOKEN);
    vi.mocked(processSignupReminders)
      .mockResolvedValueOnce({ checked: 3, sent: 2, skippedPaid: 1, failed: 0 })
      .mockResolvedValueOnce({ checked: 1, sent: 0, skippedPaid: 0, failed: 1 });

    const ok = await call(`Bearer ${TOKEN}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ checked: 3, sent: 2, skippedPaid: 1, failed: 0 });

    const failed = await call(`Bearer ${TOKEN}`);
    expect(failed.status).toBe(502);
  });
});
