import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { MAX_UPLOAD_BYTES } from "@/lib/uploads/limits";
import { handleListingPictureRequest, type ListingPictureRequestDeps } from "./listing-picture-request";
import type { ListingPictureOutcome } from "./listing-pictures";

vi.mock("server-only", () => ({}));

const APP_ORIGIN = "http://app.localhost:3000";
const APP_HOST = "app.localhost:3000";
const NO_LISTING = "Pictures can't be added to this business. Email us and we'll sort it out.";

const tenant: TenantContext = {
  userId: "user-a",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Smile Dental",
  role: "owner",
};
const stored = { id: "0192f3c4-2222-7000-8000-000000000002", slot: "ad_tall", status: "pending" } as const;

interface RequestOptions {
  readonly slot?: string | null;
  readonly host?: string;
  readonly origin?: string;
  readonly contentLength?: string;
  readonly chunks?: readonly Uint8Array[];
}

let pulled = 0;

/** A request whose body yields one chunk a pull, so a test can see whether the handler read any of it. */
function pictureRequest(options: RequestOptions = {}): Request {
  const chunks = options.chunks ?? [new Uint8Array([1, 2, 3])];
  pulled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[pulled];
        if (chunk === undefined) {
          controller.close();
          return;
        }
        pulled += 1;
        controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  const headers = new Headers({
    "content-type": "image/webp",
    host: options.host ?? APP_HOST,
    origin: options.origin ?? APP_ORIGIN,
    "content-length": options.contentLength ?? "3",
  });
  const slot = options.slot === undefined ? "ad_tall" : options.slot;
  const url = slot === null ? `${APP_ORIGIN}/api/listing-pictures` : `${APP_ORIGIN}/api/listing-pictures?slot=${slot}`;
  // Node needs `duplex` to send a streamed body; the DOM typings used by this project do not know the option yet.
  const init: RequestInit & { readonly duplex: "half" } = { method: "POST", headers, body: stream, duplex: "half" };
  return new Request(url, init);
}

let deps: {
  getTenant: ReturnType<typeof vi.fn<ListingPictureRequestDeps["getTenant"]>>;
  appOrigin: string;
  canAddPictures: ReturnType<typeof vi.fn<ListingPictureRequestDeps["canAddPictures"]>>;
  decodeBusy: ReturnType<typeof vi.fn<ListingPictureRequestDeps["decodeBusy"]>>;
  consumeAllowance: ReturnType<typeof vi.fn<ListingPictureRequestDeps["consumeAllowance"]>>;
  store: ReturnType<typeof vi.fn<ListingPictureRequestDeps["store"]>>;
};

beforeEach(() => {
  deps = {
    getTenant: vi.fn<ListingPictureRequestDeps["getTenant"]>().mockResolvedValue(tenant),
    appOrigin: APP_ORIGIN,
    canAddPictures: vi.fn<ListingPictureRequestDeps["canAddPictures"]>().mockResolvedValue(true),
    decodeBusy: vi.fn<ListingPictureRequestDeps["decodeBusy"]>().mockReturnValue(null),
    consumeAllowance: vi.fn<ListingPictureRequestDeps["consumeAllowance"]>().mockResolvedValue({ allowed: true }),
    store: vi.fn<ListingPictureRequestDeps["store"]>().mockResolvedValue({ ok: true, picture: stored } satisfies ListingPictureOutcome),
  };
});

async function expectRefused(response: Response, status: number, message?: string): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: message ?? expect.any(String) });
}

/** Nothing was stored, no budget was spent and the body was never read. */
function expectNothingDone(): void {
  expect(deps.consumeAllowance).not.toHaveBeenCalled();
  expect(deps.store).not.toHaveBeenCalled();
  expect(pulled).toBe(0);
}

describe("handleListingPictureRequest", () => {
  it("stores the picture for its slot and answers 201", async () => {
    const response = await handleListingPictureRequest(pictureRequest({ chunks: [new Uint8Array([1, 2]), new Uint8Array([3])] }), deps);

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ picture: stored });
    expect(deps.store).toHaveBeenCalledWith(tenant, "ad_tall", new Uint8Array([1, 2, 3]));
  });

  it("refuses another host or origin before looking anything up", async () => {
    await expectRefused(await handleListingPictureRequest(pictureRequest({ host: "fynix.digital" }), deps), 403);
    await expectRefused(await handleListingPictureRequest(pictureRequest({ origin: "https://evil.example" }), deps), 403);
    expect(deps.getTenant).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("refuses a declared length over the limit without reading the body", async () => {
    const response = await handleListingPictureRequest(pictureRequest({ contentLength: String(MAX_UPLOAD_BYTES + 1) }), deps);
    await expectRefused(response, 413, "That file is larger than 4 MB. Please upload a smaller image.");
    expect(deps.getTenant).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("refuses a missing or unknown slot", async () => {
    for (const slot of [null, "logo", "ad", ""]) {
      await expectRefused(await handleListingPictureRequest(pictureRequest({ slot }), deps), 400);
    }
    expect(deps.getTenant).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("refuses a visitor who is not signed in", async () => {
    deps.getTenant.mockResolvedValue(null);
    await expectRefused(await handleListingPictureRequest(pictureRequest(), deps), 401, "Your session has ended. Sign in again, then try the upload.");
    expect(deps.canAddPictures).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("refuses an account with no listing before spending its budget", async () => {
    deps.canAddPictures.mockResolvedValue(false);
    await expectRefused(await handleListingPictureRequest(pictureRequest(), deps), 409, NO_LISTING);
    expect(deps.decodeBusy).not.toHaveBeenCalled();
    expectNothingDone();
  });

  it("answers 503 with Retry-After when the server is too busy to decode, without spending the budget", async () => {
    deps.decodeBusy.mockReturnValue({ message: "Busy.", retryAfterSeconds: 10 });
    const response = await handleListingPictureRequest(pictureRequest(), deps);
    expect(response.headers.get("retry-after")).toBe("10");
    await expectRefused(response, 503, "Busy.");
    expectNothingDone();
  });

  it("answers 429 with Retry-After once the hourly budget is spent", async () => {
    deps.consumeAllowance.mockResolvedValue({ allowed: false, retryAfterSeconds: 120, message: "Try again in 2 minutes." });
    const response = await handleListingPictureRequest(pictureRequest(), deps);
    expect(response.headers.get("retry-after")).toBe("120");
    await expectRefused(response, 429, "Try again in 2 minutes.");
    expect(deps.store).not.toHaveBeenCalled();
    expect(pulled).toBe(0);
  });

  it("stops reading a body that is larger than it declared", async () => {
    const chunk = new Uint8Array(MAX_UPLOAD_BYTES);
    const response = await handleListingPictureRequest(pictureRequest({ chunks: [chunk, chunk, chunk] }), deps);
    await expectRefused(response, 413);
    expect(pulled).toBeLessThan(3);
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("maps each refusal from storing to its status", async () => {
    const cases: readonly (readonly [ListingPictureOutcome, number])[] = [
      [{ ok: false, refusal: "unsupported-type", message: "Not an image." }, 415],
      [{ ok: false, refusal: "unreadable", message: "Damaged." }, 422],
      [{ ok: false, refusal: "empty", message: "Empty." }, 422],
      [{ ok: false, refusal: "too-large", message: "Too large." }, 413],
      [{ ok: false, refusal: "no-claim", message: NO_LISTING }, 409],
      [{ ok: false, refusal: "busy", message: "Busy.", retryAfterSeconds: 10 }, 503],
    ];
    for (const [outcome, status] of cases) {
      deps.store.mockResolvedValue(outcome);
      const response = await handleListingPictureRequest(pictureRequest(), deps);
      if (outcome.ok) throw new Error("Expected a refusal");
      expect(response.headers.get("retry-after")).toBe(outcome.retryAfterSeconds === undefined ? null : "10");
      await expectRefused(response, status, outcome.message);
    }
  });
});
