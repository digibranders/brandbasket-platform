import type { DeliveryHealth } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { healthRows, needsLookCount, type HealthInput } from "./system-health-view";

const QUIET = { total: 0, failed: 0, lastOkAt: null, lastFailedAt: null };
const HEALTHY: DeliveryHealth = { razorpay: QUIET, calcom: QUIET, oyechats: QUIET, brevo: QUIET, teams: QUIET };
const FINE: HealthInput = { deliveries: HEALTHY, openErrors: 0, googleStatuses: ["connected", "connected"], teamsMissing: 0, teamsKinds: 5 };

const rowOf = (input: HealthInput, key: string) => healthRows(input).find((row) => row.key === key);

describe("healthRows", () => {
  it("lists the six rows in order, with the timers honestly not known", () => {
    const rows = healthRows(FINE);
    expect(rows.map((row) => row.key)).toEqual(["emails", "webhooks", "errors", "google", "teams", "timers"]);
    expect(rows.map((row) => row.state)).toEqual(["ok", "ok", "ok", "ok", "ok", "unknown"]);
    expect(needsLookCount(rows)).toBe(0);
  });

  it("flags failed emails and sums the webhook sources separately", () => {
    const input = { ...FINE, deliveries: { ...HEALTHY, brevo: { ...QUIET, failed: 2 }, razorpay: { ...QUIET, failed: 1 }, oyechats: { ...QUIET, failed: 3 }, teams: { ...QUIET, failed: 9 } } };
    expect(rowOf(input, "emails")).toMatchObject({ state: "look", detail: "2 failed in the last 24 hours" });
    expect(rowOf(input, "webhooks")).toMatchObject({ state: "look", detail: "4 failed in the last 24 hours" });
  });

  it("flags open app errors", () => {
    expect(rowOf({ ...FINE, openErrors: 3 }, "errors")).toMatchObject({ state: "look", detail: "3 open" });
  });

  it("flags a Google connection that lost access, and says so when Google was never connected", () => {
    expect(rowOf({ ...FINE, googleStatuses: ["connected", "access_lost"] }, "google")).toMatchObject({ state: "look", detail: "1 connection needs reconnecting" });
    expect(rowOf({ ...FINE, googleStatuses: [null, null] }, "google")?.state).toBe("unknown");
  });

  it("flags Teams kinds with no usable address", () => {
    expect(rowOf({ ...FINE, teamsMissing: 2 }, "teams")).toMatchObject({ state: "look", detail: "2 of 5 alert kinds have no usable address, so they are not sent to Teams" });
  });

  it("shows a failed read as not known, never as fine, and keeps it out of the count", () => {
    const rows = healthRows({ deliveries: null, openErrors: null, googleStatuses: null, teamsMissing: null, teamsKinds: 5 });
    expect(rows.every((row) => row.state === "unknown")).toBe(true);
    expect(needsLookCount(rows)).toBe(0);
  });
});
