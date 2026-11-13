import { expect, it, vi } from "vitest";
import {
  supportRetentionCutoff,
  supportRetentionMonths,
  runSupportRetention,
} from "./support-retention";
vi.mock("server-only", () => ({}));
it("keeps closed tickets 24 months when unset or empty, the approved retention schedule", () => {
  expect(supportRetentionMonths({})).toBe(24);
  expect(supportRetentionMonths({ SUPPORT_TICKET_RETENTION_MONTHS: "" })).toBe(24);
  expect(supportRetentionMonths({ SUPPORT_TICKET_RETENTION_MONTHS: "   " })).toBe(24);
});
it("takes another positive whole number of months and rejects anything else, including 0", () => {
  expect(supportRetentionMonths({ SUPPORT_TICKET_RETENTION_MONTHS: "12" })).toBe(12);
  expect(supportRetentionMonths({ SUPPORT_TICKET_RETENTION_MONTHS: " 1 " })).toBe(1);
  expect(supportRetentionMonths({ SUPPORT_TICKET_RETENTION_MONTHS: "120" })).toBe(120);
  for (const bad of ["0", "-1", "121", "1.5", "twelve", "12 months"])
    expect(() => supportRetentionMonths({ SUPPORT_TICKET_RETENTION_MONTHS: bad })).toThrow("1 to 120");
});
it("clamps leap dates when it counts back calendar months", () => {
  expect(supportRetentionCutoff(new Date("2028-02-29T12:20:00Z"), 12)).toEqual(
    new Date("2027-02-28T12:20:00Z"),
  );
});
it("keeps closed ticket content while a private object awaits deletion and retries later", async () => {
  let storageFails = true;
  const finalize = vi.fn(async () => 1);
  const deps = {
    claim: async () => ({
      ticketIds: ["ticket"],
      attachments: [{ id: "id", storageKey: "key", ticketId: "ticket" }],
    }),
    purge: async () =>
      storageFails ? { purged: 0, failed: 1 } : { purged: 1, failed: 0 },
    finalize,
  };
  expect(await runSupportRetention(deps, new Date(), 100)).toEqual({
    purged: 0,
    failed: 1,
    ticketsPurged: 0,
  });
  expect(finalize).not.toHaveBeenCalled();
  storageFails = false;
  expect(await runSupportRetention(deps, new Date(), 100)).toEqual({
    purged: 1,
    failed: 0,
    ticketsPurged: 1,
  });
});
it("bounds private object deletes before finalizing a large retained conversation", async () => {
  const finalize = vi.fn();
  const purge = vi.fn(
    async (rows: readonly { id: string; storageKey: string }[]) => ({
      purged: rows.length,
      failed: 0,
    }),
  );
  const result = await runSupportRetention(
    {
      claim: async () => ({
        ticketIds: ["ticket"],
        attachments: [
          { id: "a", storageKey: "a", ticketId: "ticket" },
          { id: "b", storageKey: "b", ticketId: "ticket" },
        ],
      }),
      purge,
      finalize,
    },
    new Date(),
    1,
  );
  expect(result).toEqual({ purged: 1, failed: 0, ticketsPurged: 0 });
  expect(purge.mock.calls[0]?.[0]).toHaveLength(1);
  expect(finalize).not.toHaveBeenCalled();
});
