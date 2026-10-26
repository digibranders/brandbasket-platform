import { countActiveErrorIssues, listRecentEmails, type StoredEmail } from "@brandbasket/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSystemHealth, SYSTEM_SOURCES, type SystemSource } from "./system-health";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ countActiveErrorIssues: vi.fn(), listRecentEmails: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));

// 15:28 on Monday 30 November 2026 in India.
const NOW = new Date("2026-11-30T09:58:00.000Z");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readSystemHealth", () => {
  it("reports a source that fails to read as one that needs a look, and keeps the rest", async () => {
    const working: SystemSource = { key: "ok", label: "Working", read: async () => ({ state: "ok", detail: "fine" }) };
    const broken: SystemSource = { key: "broken", label: "Broken", read: async () => { throw new Error("down"); } };
    expect(await readSystemHealth(NOW, [working, broken])).toEqual([
      { key: "ok", label: "Working", state: "ok", detail: "fine" },
      { key: "broken", label: "Broken", state: "warn", detail: "could not check" },
    ]);
  });

  it("says when the last email went out, and how many errors are open", async () => {
    vi.mocked(listRecentEmails).mockResolvedValue([{ createdAt: new Date("2026-11-30T04:10:00.000Z") } as StoredEmail]);
    vi.mocked(countActiveErrorIssues).mockResolvedValue(2);
    expect(await readSystemHealth(NOW, SYSTEM_SOURCES)).toEqual([
      { key: "email", label: "Email", state: "ok", detail: "last 09:40" },
      { key: "errors", label: "Website errors", state: "bad", detail: "2 open" },
    ]);
  });

  it("uses a date for an email sent before today, and says when nothing went out", async () => {
    vi.mocked(listRecentEmails).mockResolvedValueOnce([{ createdAt: new Date("2026-11-27T04:10:00.000Z") } as StoredEmail]);
    vi.mocked(countActiveErrorIssues).mockResolvedValue(0);
    const lines = await readSystemHealth(NOW, SYSTEM_SOURCES);
    expect(lines.map((line) => line.detail)).toEqual(["last 27 Nov", "0 new"]);

    vi.mocked(listRecentEmails).mockResolvedValueOnce([]);
    const quiet = await readSystemHealth(NOW, SYSTEM_SOURCES);
    expect(quiet[0]?.detail).toBe("nothing sent yet");
  });
});
