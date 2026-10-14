import { describe, expect, it, vi } from "vitest";
import { createVimeoClient, vimeoTokenFromEnv, VimeoError, type VimeoFetch } from "./vimeo";

vi.mock("server-only", () => ({}));

function reply(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function clientWith(...answers: Response[]): { client: ReturnType<typeof createVimeoClient>; fetch: ReturnType<typeof vi.fn<VimeoFetch>> } {
  const fetch = vi.fn<VimeoFetch>();
  for (const answer of answers) fetch.mockResolvedValueOnce(answer);
  return { client: createVimeoClient("secret-token", fetch), fetch };
}

const FOLDER_URI = "/users/165439204/projects/30820334";

/** Vimeo's answer to the list of the account's folders. */
function folders(...names: readonly [string, string][]): Response {
  return reply(200, { data: names.map(([name, uri]) => ({ name, uri })), paging: { next: null } });
}

const FYNIX_FOLDER = (): Response => folders(["My library", "/users/165439204/projects/30820329"], ["Fynix", FOLDER_URI]);

const READY = {
  status: "available",
  upload: { status: "complete" },
  transcode: { status: "complete" },
  duration: 15.8,
  width: 1280,
  height: 720,
  player_embed_url: "https://player.vimeo.com/video/1233986429?h=858a280296",
  pictures: {
    sizes: [
      { width: 100, height: 75, link: "https://i.vimeocdn.com/video/1-aaa_100x75" },
      { width: 640, height: 360, link: "https://i.vimeocdn.com/video/1-aaa_640x360" },
      { width: 1280, height: 720, link: "https://i.vimeocdn.com/video/1-aaa_1280x720" },
    ],
  },
};

describe("vimeoTokenFromEnv", () => {
  it("is the trimmed token, or null when there is none", () => {
    expect(vimeoTokenFromEnv({ VIMEO_ACCESS_TOKEN: "  abc  " })).toBe("abc");
    expect(vimeoTokenFromEnv({ VIMEO_ACCESS_TOKEN: "   " })).toBeNull();
    expect(vimeoTokenFromEnv({})).toBeNull();
  });
});

describe("createUpload", () => {
  it("asks Vimeo for a resumable upload of a private-link video that others cannot download, and reads back its id and upload address", async () => {
    const { client, fetch } = clientWith(FYNIX_FOLDER(), reply(200, { uri: "/videos/1233986429", upload: { approach: "tus", upload_link: "https://global.upload.vimeo.com/files/abc?x=1" } }));
    expect(await client.createUpload({ size: 20_000_000, name: "Fynix clip" })).toEqual({
      vimeoId: "1233986429",
      uploadLink: "https://global.upload.vimeo.com/files/abc?x=1",
    });

    const [url, init] = fetch.mock.calls[1] ?? [];
    expect(String(url)).toBe("https://api.vimeo.com/me/videos");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("bearer secret-token");
    expect(headers.get("accept")).toBe("application/vnd.vimeo.*+json;version=3.4");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(init?.body))).toEqual({
      upload: { approach: "tus", size: 20_000_000 },
      name: "Fynix clip",
      privacy: { view: "unlisted", embed: "public", download: false },
      folder_uri: FOLDER_URI,
    });
  });

  it("puts every video in the Fynix folder, found by name whatever its capitals, looking it up once", async () => {
    const { client, fetch } = clientWith(
      folders(["Other", "/users/1/projects/1"], ["fynix", FOLDER_URI]),
      reply(200, { uri: "/videos/1", upload: { approach: "tus", upload_link: "https://global.upload.vimeo.com/files/a" } }),
      reply(200, { uri: "/videos/2", upload: { approach: "tus", upload_link: "https://global.upload.vimeo.com/files/b" } }),
    );
    await client.createUpload({ size: 1000, name: "one" });
    await client.createUpload({ size: 1000, name: "two" });
    const calls = fetch.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url).replace("https://api.vimeo.com", "").split("?")[0]}`);
    expect(calls).toEqual(["GET /me/projects", "POST /me/videos", "POST /me/videos"]);
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body)).folder_uri).toBe(FOLDER_URI);
  });

  it("finds the folder on a later page of the account's folders", async () => {
    const first = reply(200, { data: [{ name: "My library", uri: "/users/1/projects/2" }], paging: { next: "/me/projects?page=2&per_page=100" } });
    const { client, fetch } = clientWith(
      first,
      folders(["Fynix", FOLDER_URI]),
      reply(200, { uri: "/videos/1", upload: { approach: "tus", upload_link: "https://global.upload.vimeo.com/files/a" } }),
    );
    await client.createUpload({ size: 1000, name: "one" });
    expect(String(fetch.mock.calls[1]?.[0])).toContain("page=2");
  });

  it("makes no video at all when there is no Fynix folder, rather than leave one loose in the library, and says why", async () => {
    const { client, fetch } = clientWith(folders(["My library", "/users/165439204/projects/30820329"]));
    await expect(client.createUpload({ size: 1000, name: "x" })).rejects.toMatchObject({ name: "VimeoError", reason: "configuration" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("will not use a folder address that is not an ordinary one, and tries the lookup again next time", async () => {
    const { client, fetch } = clientWith(
      folders(["Fynix", "/users/1/projects/1/../../me/videos"]),
      FYNIX_FOLDER(),
      reply(200, { uri: "/videos/1", upload: { approach: "tus", upload_link: "https://global.upload.vimeo.com/files/a" } }),
    );
    await expect(client.createUpload({ size: 1000, name: "x" })).rejects.toMatchObject({ reason: "configuration" });
    await expect(client.createUpload({ size: 1000, name: "y" })).resolves.toMatchObject({ vimeoId: "1" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("refuses an answer that is not a resumable upload, or whose upload address is not Vimeo's, rather than send a browser anywhere else", async () => {
    const wrongApproach = clientWith(FYNIX_FOLDER(), reply(200, { uri: "/videos/1", upload: { approach: "post", upload_link: "https://global.upload.vimeo.com/x" } }));
    await expect(wrongApproach.client.createUpload({ size: 1000, name: "x" })).rejects.toThrow("resumable");
    const elsewhere = clientWith(FYNIX_FOLDER(), reply(200, { uri: "/videos/1", upload: { approach: "tus", upload_link: "https://evil.example.com/files/abc" } }));
    await expect(elsewhere.client.createUpload({ size: 1000, name: "x" })).rejects.toThrow("upload address");
    const http = clientWith(FYNIX_FOLDER(), reply(200, { uri: "/videos/1", upload: { approach: "tus", upload_link: "http://global.upload.vimeo.com/files/abc" } }));
    await expect(http.client.createUpload({ size: 1000, name: "x" })).rejects.toThrow("upload address");
    const noId = clientWith(FYNIX_FOLDER(), reply(200, { uri: "/videos/not-digits", upload: { approach: "tus", upload_link: "https://global.upload.vimeo.com/files/abc" } }));
    await expect(noId.client.createUpload({ size: 1000, name: "x" })).rejects.toThrow("video id");
  });

  it.each([
    [4101, "quota"],
    [4102, "quota"],
    [4104, "quota"],
  ] as const)("says the upload limit was reached for Vimeo's error %i, so the owner can be told to try later", async (code, reason) => {
    const { client } = clientWith(FYNIX_FOLDER(), reply(403, { error_code: code, developer_message: "Basic users have limited disk space for a given period." }));
    await expect(client.createUpload({ size: 1000, name: "x" })).rejects.toMatchObject({ name: "VimeoError", reason, status: 403 });
  });

  it("says the token was refused for a 401, and keeps other failures plain", async () => {
    const refused = clientWith(FYNIX_FOLDER(), reply(401, { error: "You must provide a valid authenticated access token." }));
    await expect(refused.client.createUpload({ size: 1000, name: "x" })).rejects.toMatchObject({ reason: "unauthorized", status: 401 });
    const broken = clientWith(FYNIX_FOLDER(), reply(500, null));
    await expect(broken.client.createUpload({ size: 1000, name: "x" })).rejects.toBeInstanceOf(VimeoError);
  });
});

describe("getVideo", () => {
  it("reads a prepared video: its length, size, the hash of its embed address and a 640-wide poster", async () => {
    const { client, fetch } = clientWith(reply(200, READY));
    expect(await client.getVideo("1233986429")).toEqual({
      vimeoId: "1233986429",
      state: "ready",
      seconds: 15.8,
      width: 1280,
      height: 720,
      hash: "858a280296",
      posterUrl: "https://i.vimeocdn.com/video/1-aaa_640x360",
    });
    const [url] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toContain("https://api.vimeo.com/videos/1233986429?fields=");
  });

  it.each([
    [{ status: "uploading", upload: { status: "in_progress" } }, "uploading"],
    [{ status: "transcoding", upload: { status: "complete" } }, "preparing"],
    [{ status: "transcode_starting", upload: { status: "complete" } }, "preparing"],
    [{ status: "uploading_error" }, "failed"],
    [{ status: "transcoding_error" }, "failed"],
    [{ status: "quota_exceeded" }, "failed"],
  ] as const)("reads Vimeo's %j as %s", async (body, state) => {
    const { client } = clientWith(reply(200, body));
    expect((await client.getVideo("1233986429"))?.state).toBe(state);
  });

  it("says a video is still being prepared until it has everything the page needs: a hash and a poster", async () => {
    const noHash = clientWith(reply(200, { ...READY, player_embed_url: "https://player.vimeo.com/video/1233986429" }));
    expect((await noHash.client.getVideo("1233986429"))?.state).toBe("preparing");
    const noPoster = clientWith(reply(200, { ...READY, pictures: { sizes: [] } }));
    expect((await noPoster.client.getVideo("1233986429"))?.state).toBe("preparing");
    const elsewhere = clientWith(reply(200, { ...READY, pictures: { sizes: [{ width: 640, height: 360, link: "https://evil.example.com/p.jpg" }] } }));
    expect((await elsewhere.client.getVideo("1233986429"))?.state).toBe("preparing");
  });

  it("says a video is still being prepared while Vimeo is making its smaller versions, as its size is not final until then", async () => {
    const { client } = clientWith(reply(200, { ...READY, width: 426, height: 240, transcode: { status: "in_progress" } }));
    expect((await client.getVideo("1233986429"))?.state).toBe("preparing");
  });

  it("is null for a video Vimeo no longer has", async () => {
    const { client } = clientWith(reply(404, { error: "not found" }));
    expect(await client.getVideo("1233986429")).toBeNull();
  });

  it("refuses an id that is not digits before it asks Vimeo anything", async () => {
    const { client, fetch } = clientWith();
    await expect(client.getVideo("12/../me")).rejects.toThrow("video id");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("deleteVideo", () => {
  it("deletes the video, and treats one that is already gone as done", async () => {
    const { client, fetch } = clientWith(reply(204, null), reply(404, { error: "gone" }));
    await expect(client.deleteVideo("1233986429")).resolves.toBeUndefined();
    await expect(client.deleteVideo("1233986429")).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.vimeo.com/videos/1233986429");
    expect(init?.method).toBe("DELETE");
  });

  it("lets any other failure through, so a video is not forgotten while still on Vimeo", async () => {
    const { client } = clientWith(reply(500, null));
    await expect(client.deleteVideo("1233986429")).rejects.toBeInstanceOf(VimeoError);
  });
});
