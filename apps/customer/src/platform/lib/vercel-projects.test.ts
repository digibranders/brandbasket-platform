// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { redeployProduction, setVercelProjectEnv, setVercelProjectPaused } from "./vercel-projects";

const SITE = { vercelProjectId: "prj_abc123", vercelTeamId: "team_xyz" };

function reply(status: number, body: unknown = {}): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(Response.json(body, { status }));
}

describe("setVercelProjectPaused", () => {
  it("posts to the pause endpoint with the team and the bearer token", async () => {
    const fetchMock = reply(200);
    await setVercelProjectPaused(SITE, true, { token: "tok", fetch: fetchMock });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetchMock).mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.vercel.com/v1/projects/prj_abc123/pause?teamId=team_xyz");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("posts to the unpause endpoint, without a team when the project has none", async () => {
    const fetchMock = reply(200);
    await setVercelProjectPaused({ vercelProjectId: "prj_abc123", vercelTeamId: null }, false, { token: "tok", fetch: fetchMock });
    expect(String(vi.mocked(fetchMock).mock.calls[0]?.[0])).toBe("https://api.vercel.com/v1/projects/prj_abc123/unpause");
  });

  it("names the status and Vercel's message when it refuses, never the token", async () => {
    const fetchMock = reply(403, { error: { code: "forbidden", message: "Not authorized" } });
    const attempt = setVercelProjectPaused(SITE, true, { token: "secret-token", fetch: fetchMock });
    await expect(attempt).rejects.toThrow("Vercel answered 403 to pause: Not authorized");
    await expect(attempt).rejects.not.toThrow(/secret-token/);
  });

  it("still names the status when the answer is not JSON", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    await expect(setVercelProjectPaused(SITE, false, { token: "tok", fetch: fetchMock })).rejects.toThrow(
      "Vercel answered 502 to unpause.",
    );
  });

  it("reports an unreachable host plainly", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(setVercelProjectPaused(SITE, true, { token: "tok", fetch: fetchMock })).rejects.toThrow(
      "Could not reach Vercel to pause the project.",
    );
  });

  it("refuses when no token is set", async () => {
    await expect(setVercelProjectPaused(SITE, true, { token: null, fetch: reply(200) })).rejects.toThrow(
      "VERCEL_API_TOKEN is not set.",
    );
  });
});

describe("setVercelProjectEnv", () => {
  it("upserts a production variable on the project, with the team and the bearer token", async () => {
    const fetchMock = reply(201);
    await setVercelProjectEnv(SITE, "NEXT_PUBLIC_GSC_VERIFICATION", "tok123", { token: "tok", fetch: fetchMock });
    const [url, init] = vi.mocked(fetchMock).mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.vercel.com/v10/projects/prj_abc123/env?upsert=true&teamId=team_xyz");
    expect(JSON.parse(String(init?.body))).toEqual({ key: "NEXT_PUBLIC_GSC_VERIFICATION", value: "tok123", type: "plain", target: ["production"] });
  });
  it("names the status and Vercel's message when it refuses, and never the token or the value", async () => {
    const attempt = setVercelProjectEnv(SITE, "K", "the-value", { token: "secret-token", fetch: reply(403, { error: { message: "Not authorized" } }) });
    await expect(attempt).rejects.toThrow("Vercel answered 403 to set K: Not authorized");
    await expect(attempt).rejects.not.toThrow(/secret-token|the-value/);
  });
});

describe("redeployProduction", () => {
  it("builds the newest ready production deployment again", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ deployments: [{ uid: "dpl_1", name: "kulkarni" }] })).mockResolvedValueOnce(Response.json({}));
    await redeployProduction(SITE, { token: "tok", fetch: fetchMock });
    expect(String(vi.mocked(fetchMock).mock.calls[0]?.[0])).toBe("https://api.vercel.com/v6/deployments?projectId=prj_abc123&target=production&state=READY&limit=1&teamId=team_xyz");
    const [url, init] = vi.mocked(fetchMock).mock.calls[1] ?? [];
    expect(String(url)).toBe("https://api.vercel.com/v13/deployments?forceNew=1&teamId=team_xyz");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "kulkarni", deploymentId: "dpl_1", target: "production" });
  });
  it("says so when there is nothing ready to build again", async () => {
    await expect(redeployProduction(SITE, { token: "tok", fetch: reply(200, { deployments: [] }) })).rejects.toThrow("no ready production deployment");
  });
});
