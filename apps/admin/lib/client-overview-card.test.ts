import { describe, expect, it } from "vitest";
import type { ClientDetail } from "@brandbasket/db";
import type { ClientException } from "./client-exceptions";
import { overviewCard } from "./client-next-step";

const NOW = new Date("2026-11-20T09:00:00.000Z");
const PAID = { subscription: null, firstPayment: {} };
const none = { ok: true, value: [] } as const;
const clear = { exceptions: [], unreadable: [] };
const exception = { key: "renewal", title: "Check the failed renewal" } as ClientException;

function client(status: string | null, billing: unknown = PAID): Pick<ClientDetail, "project" | "movingTo" | "billing"> {
  return { project: status === null ? null : { status, slaDueAt: null }, movingTo: null, billing } as never;
}

describe("overviewCard", () => {
  it("leads with the first exception over everything else", () => {
    const card = overviewCard({ client: client("building"), now: NOW, result: { exceptions: [exception], unreadable: [] }, servicesToSetUp: none });
    expect(card).toEqual({ kind: "exception", exception });
  });

  it("says it could not check when a read failed and nothing else is known", () => {
    expect(overviewCard({ client: client("preview"), now: NOW, result: { exceptions: [], unreadable: ["payments"] }, servicesToSetUp: none })).toEqual({ kind: "unreadable", unreadable: ["payments"] });
    expect(overviewCard({ client: client("preview"), now: NOW, result: clear, servicesToSetUp: { ok: false } })).toEqual({ kind: "unreadable", unreadable: ["the services"] });
  });

  it("is clear only when every read worked and nothing waits", () => {
    expect(overviewCard({ client: client("preview"), now: NOW, result: clear, servicesToSetUp: none })).toEqual({ kind: "clear" });
  });

  it("is not paid for a business with no project and no payment", () => {
    expect(overviewCard({ client: client(null, { subscription: null, firstPayment: null }), now: NOW, result: clear, servicesToSetUp: none })).toEqual({ kind: "not-paid" });
  });

  it("covers Social, Paid Ads and Monitoring: a paid service to set up comes after the website step", () => {
    const service = { id: "social-media", title: "Social Media Management" };
    const toSetUp = { ok: true, value: [service] } as const;
    expect(overviewCard({ client: client("preview"), now: NOW, result: clear, servicesToSetUp: toSetUp })).toEqual({ kind: "service", service });
    expect(overviewCard({ client: client("building"), now: NOW, result: clear, servicesToSetUp: toSetUp }).kind).toBe("stage");
  });
});
