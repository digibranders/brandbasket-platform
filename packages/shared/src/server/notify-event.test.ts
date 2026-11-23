import type { Database } from "@brandbasket/db";
import { describe, expect, it, vi } from "vitest";
import { notifyEvent } from "./notify-event";

const DB = {} as Database;
const INPUT = { event: "request.new.staff", audience: { kind: "staff" }, dedupeKey: "t1", data: { ticketId: "t1" } } as const;

describe("notifyEvent", () => {
  it("never throws when no origin is configured, and says so in the log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(notifyEvent(DB, INPUT, {})).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[notify] a notice could not be sent", expect.objectContaining({ event: "request.new.staff" }));
    log.mockRestore();
  });

  it("skips a staff notice when only the customer origin is set, instead of linking to the wrong app", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await notifyEvent(DB, INPUT, { APP_ORIGIN: "https://app.example.test" });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
