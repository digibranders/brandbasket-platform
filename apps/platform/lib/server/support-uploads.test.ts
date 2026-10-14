import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import {
  handleSupportUploadRequest,
  processSupportImage,
  SUPPORT_BODY_LIMIT,
  type SupportUploadDeps,
} from "./support-uploads";
vi.mock("server-only", () => ({}));
const origin = "https://app.fynix.digital";
function deps(): {
  -readonly [K in keyof SupportUploadDeps]: SupportUploadDeps[K];
} {
  return {
    withUploadLock: async (_userId, work) => work(),
    appOrigin: origin,
    getRequester: async () => ({ id: "u1" }),
    isClosing: async () => false,
    consumeAllowance: async () => ({ allowed: true, retryAfterSeconds: 0 }),
    stage: vi.fn(async () => undefined),
    confirm: async () => true,
    markDeleting: vi.fn(async () => undefined),
    storage: {
      put: vi.fn(async () => undefined),
      get: vi.fn(),
      delete: vi.fn(async () => undefined),
    },
  };
}
async function request(file: Uint8Array, type = "image/png"): Promise<Request> {
  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(file)], { type }),
    "screenshot.png",
  );
  const temp = new Request(`${origin}/api/support-uploads`, {
    method: "POST",
    body: form,
  });
  const bytes = await temp.arrayBuffer();
  return new Request(temp.url, {
    method: "POST",
    body: bytes,
    headers: {
      host: "app.fynix.digital",
      origin,
      "content-type": temp.headers.get("content-type") ?? "",
      "content-length": String(bytes.byteLength),
    },
  });
}
async function png(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 12, height: 10, channels: 3, background: "red" },
    })
      .png()
      .toBuffer(),
  );
}
describe("support screenshot uploads", () => {
  it("strips metadata and determines real type from bytes", async () => {
    const processed = await processSupportImage(await png(), "image/png");
    expect(processed.mimeType).toBe("image/webp");
    expect(await sharp(processed.bytes).metadata()).toMatchObject({
      width: 12,
      height: 10,
      format: "webp",
    });
    await expect(
      processSupportImage(await png(), "image/jpeg"),
    ).rejects.toThrow("type");
    await expect(
      processSupportImage(
        new TextEncoder().encode("<script>evil</script>"),
        "image/png",
      ),
    ).rejects.toThrow("PNG");
  });
  it("checks host/origin before session or body", async () => {
    const dep = deps();
    dep.getRequester = vi.fn();
    const req = await request(await png());
    req.headers.set("origin", "https://evil.example");
    expect((await handleSupportUploadRequest(req, dep)).status).toBe(403);
    expect(dep.getRequester).not.toHaveBeenCalled();
  });
  it("refuses closing accounts without billing or uploads", async () => {
    const dep = deps();
    dep.isClosing = async () => true;
    expect(
      (await handleSupportUploadRequest(await request(await png()), dep))
        .status,
    ).toBe(409);
    expect(dep.storage.put).not.toHaveBeenCalled();
  });
  it("bounds chunked body even when content length lies", async () => {
    const dep = deps();
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(SUPPORT_BODY_LIMIT + 1));
      },
      cancel() {
        canceled = true;
      },
    });
    const req = new Request(`${origin}/api/support-uploads`, {
      method: "POST",
      body: stream,
      duplex: "half",
      headers: {
        host: "app.fynix.digital",
        origin,
        "content-type": "multipart/form-data; boundary=test",
        "content-length": "10",
      },
    } as RequestInit);
    expect((await handleSupportUploadRequest(req, dep)).status).toBe(413);
    expect(canceled).toBe(true);
    expect(dep.storage.put).not.toHaveBeenCalled();
  });
  it("stages before object writes and leaves failed writes retryable", async () => {
    const dep = deps();
    const events: string[] = [];
    dep.stage = vi.fn(async () => {
      events.push("stage");
    });
    dep.storage.put = async () => {
      events.push("put");
      throw new Error("offline");
    };
    dep.markDeleting = vi.fn(async () => {
      events.push("deleting");
    });
    const response = await handleSupportUploadRequest(
      await request(await png()),
      dep,
    );
    expect(response.status).toBe(503);
    expect(events).toEqual(["stage", "put", "deleting"]);
  });
  it("returns staged opaque ids without private keys or original filenames", async () => {
    const dep = deps();
    const response = await handleSupportUploadRequest(
      await request(await png()),
      dep,
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]).toMatchObject({
      mimeType: "image/webp",
      width: 12,
      height: 10,
    });
    expect(body.attachments[0]).not.toHaveProperty("storageKey");
    expect(body.attachments[0]).not.toHaveProperty("filename");
  });
});

it("cannot remove an attachment that was concurrently attached to a message", async () => {
  const { deleteStagedSupportUpload } = await import("./support-uploads");
  const remove = vi.fn();
  const result = await deleteStagedSupportUpload(
    {
      find: async () => ({ id: "id", storageKey: "key" }),
      markDeleting: async () => false,
      purge: remove,
    },
    "u1",
    "id",
  );
  expect(result.status).toBe(404);
  expect(remove).not.toHaveBeenCalled();
});
it("retains a deleting object when removal fails so maintenance can retry", async () => {
  const { deleteStagedSupportUpload } = await import("./support-uploads");
  const result = await deleteStagedSupportUpload(
    {
      find: async () => ({ id: "id", storageKey: "key" }),
      markDeleting: async () => true,
      purge: async () => ({ purged: 0, failed: 1 }),
    },
    "u1",
    "id",
  );
  expect(result.status).toBe(202);
});

it("deletes an object whose stage was withdrawn while the private write was active", async () => {
  const dep = deps();
  dep.confirm = async () => false;
  const response = await handleSupportUploadRequest(
    await request(await png()),
    dep,
  );
  expect(response.status).toBe(409);
  expect(dep.storage.delete).toHaveBeenCalledOnce();
  expect(dep.markDeleting).toHaveBeenCalledOnce();
});
it("strips EXIF from screenshot pixels and rejects excessive source pixels", async () => {
  const jpeg = await sharp({
    create: { width: 12, height: 10, channels: 3, background: "red" },
  })
    .withMetadata({ exif: { IFD0: { Artist: "private metadata" } } })
    .jpeg()
    .toBuffer();
  expect((await sharp(jpeg).metadata()).exif).toBeDefined();
  const normalized = await processSupportImage(
    new Uint8Array(jpeg),
    "image/jpeg",
  );
  expect((await sharp(normalized.bytes).metadata()).exif).toBeUndefined();
  const large = await sharp({
    create: { width: 4097, height: 4097, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await expect(
    processSupportImage(new Uint8Array(large), "image/png"),
  ).rejects.toThrow("read");
});
it("charges the durable screenshot budget before reading a request body", async () => {
  const dep = deps();
  dep.consumeAllowance = async () => ({
    allowed: false,
    retryAfterSeconds: 30,
  });
  const response = await handleSupportUploadRequest(
    await request(await png()),
    dep,
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("30");
  expect(dep.storage.put).not.toHaveBeenCalled();
});
it("rechecks closure after acquiring the shared upload and erasure lock", async () => {
  const dep = deps();
  let closing = false;
  dep.isClosing = async () => closing;
  dep.withUploadLock = async (_userId, work) => {
    closing = true;
    return work();
  };
  const response = await handleSupportUploadRequest(
    await request(await png()),
    dep,
  );
  expect(response.status).toBe(409);
  expect(dep.stage).not.toHaveBeenCalled();
});
