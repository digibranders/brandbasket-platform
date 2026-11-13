import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { drawBatch, type SocialAutoSettings } from "./social-auto";

const settings: SocialAutoSettings = { baseUrl: "http://127.0.0.1:4020", key: "secret", returnUrl: "https://app.example.com/social" };
const job = { job: { id: "j1", kind: "draw", state: "queued", createdAt: "2026-11-12T10:00:00Z", step: 1 }, created: true };
const answer = () => vi.fn(async () => new Response(JSON.stringify(job), { status: 202 })) as unknown as typeof fetch;
const sentBody = (send: typeof fetch): Record<string, unknown> => JSON.parse(String(vi.mocked(send).mock.calls[0]?.[1]?.body)) as Record<string, unknown>;

describe("drawBatch", () => {
  it("asks for one week of a plan when it is given that week's Monday", async () => {
    const send = answer();
    await drawBatch(settings, "b1", "week-01.json", "brandbasket:u1", "2026-11-23", false, send);
    expect(sentBody(send)).toMatchObject({ externalId: "b1", batchId: "week-01.json", action: "draw", week: "2026-11-23" });
  });

  it("asks to draw only the missing pictures of a week when told to retry", async () => {
    const send = answer();
    await drawBatch(settings, "b1", "week-01.json", "brandbasket:u1", "2026-11-23", true, send);
    expect(sentBody(send)).toMatchObject({ action: "draw", week: "2026-11-23", retry: true });
  });

  it("sends no week for a batch drawn in one piece", async () => {
    const send = answer();
    await drawBatch(settings, "b1", "week-01.json", "brandbasket:u1", undefined, false, send);
    expect(sentBody(send)).not.toHaveProperty("week");
  });
});
