import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { startSiteJob, SocialAutoError, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const job = { id: "job-1", kind: "write", state: "queued", site: "https://example.com", createdAt: "2026-11-14T00:00:00Z" };
const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const sentBody = (send: typeof fetch): Record<string, unknown> => JSON.parse(String(vi.mocked(send).mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

describe("starting a plan of posts", () => {
  it("sends the start day and the last day a post may fall on, and nothing else about dates", async () => {
    const send = answer(202, { job, created: true });
    await startSiteJob(settings, "b1", { site: "https://example.com", page: false, networks: ["instagram"], startDate: "2026-11-18", endDate: "2026-12-15" }, "actor-1", send);
    expect(sentBody(send)).toEqual({ externalId: "b1", site: "https://example.com", networks: ["instagram"], startDate: "2026-11-18", endDate: "2026-12-15" });
  });

  it("sends no dates when none are asked for, so the posting service uses its own start", async () => {
    const send = answer(202, { job, created: true });
    await startSiteJob(settings, "b1", { site: "https://example.com", page: false }, "actor-1", send);
    expect(sentBody(send)).toEqual({ externalId: "b1", site: "https://example.com" });
  });

  it("raises the posting service's refusal of an end day it cannot use", async () => {
    const send = answer(400, { error: "bad day", code: "INVALID_DAY" });
    await expect(startSiteJob(settings, "b1", { site: "https://example.com", page: false, startDate: "2026-11-18", endDate: "2027-02-01" }, "actor-1", send)).rejects.toBeInstanceOf(SocialAutoError);
  });
});
