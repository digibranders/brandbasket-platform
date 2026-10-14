import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "./limits";
import { prepareImageForUpload } from "./prepare-image";
import { LISTING_PICTURE_ROUTE, UPLOAD_ROUTE, uploadImage, uploadListingPicture } from "./upload-client";

vi.mock("./prepare-image", () => ({ prepareImageForUpload: vi.fn() }));

const mockedPrepare = vi.mocked(prepareImageForUpload);
const fetchMock = vi.fn<typeof fetch>();
const UNEXPECTED = "Something went wrong with that upload. Reload the page and try again.";

function photo(bytes = 3): File {
  return new File([new Uint8Array(bytes)], "front desk.jpg", { type: "image/jpeg" });
}

beforeEach(() => {
  mockedPrepare.mockImplementation((file) => Promise.resolve(file));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("uploadImage", () => {
  it("posts the raw image to the API upload route, outside the proxy", async () => {
    fetchMock.mockResolvedValue(Response.json({ asset: {} }, { status: 201 }));

    await expect(uploadImage(photo(), "logo")).resolves.toEqual({ ok: true });

    expect(UPLOAD_ROUTE).toBe("/api/uploads");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads?purpose=logo",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "image/jpeg", "X-File-Name": "front%20desk.jpg" },
      }),
    );
  });

  it("refuses a prepared image over the limit without sending it", async () => {
    await expect(uploadImage(photo(MAX_UPLOAD_BYTES + 1), "photo")).resolves.toEqual({
      ok: false,
      message: TOO_LARGE_MESSAGE,
    });
    expect(TOO_LARGE_MESSAGE).toBe("That file is larger than 4 MB. Please upload a smaller image.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's own message when it sent one", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "You can add up to 20 photos." }, { status: 409 }));
    await expect(uploadImage(photo(), "photo")).resolves.toEqual({ ok: false, message: "You can add up to 20 photos." });
  });

  it("shows the size message for a 413 that is not our JSON, as a platform in front of the app sends", async () => {
    for (const body of ["Request Entity Too Large", "<html><body>413</body></html>", ""]) {
      fetchMock.mockResolvedValueOnce(new Response(body, { status: 413, headers: { "Content-Type": "text/plain" } }));
      await expect(uploadImage(photo(), "photo"), body).resolves.toEqual({ ok: false, message: TOO_LARGE_MESSAGE });
    }
    fetchMock.mockResolvedValueOnce(Response.json({ unexpected: true }, { status: 413 }));
    await expect(uploadImage(photo(), "photo")).resolves.toEqual({ ok: false, message: TOO_LARGE_MESSAGE });
  });

  it("falls back to the generic message for any other failure without a usable body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
    await expect(uploadImage(photo(), "photo")).resolves.toEqual({ ok: false, message: UNEXPECTED });
    fetchMock.mockResolvedValueOnce(Response.json({ error: "" }, { status: 500 }));
    await expect(uploadImage(photo(), "photo")).resolves.toEqual({ ok: false, message: UNEXPECTED });
  });

  it("explains a network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadImage(photo(), "photo")).resolves.toEqual({
      ok: false,
      message: "We couldn't upload that file. Check your connection and try again.",
    });
  });
});

describe("uploadListingPicture", () => {
  const cropped = new Blob([new Uint8Array(3)], { type: "image/webp" });

  it("posts the cropped picture to its slot, as it is", async () => {
    fetchMock.mockResolvedValue(Response.json({ picture: {} }, { status: 201 }));

    await expect(uploadListingPicture(cropped, "ad_wide")).resolves.toEqual({ ok: true });

    expect(LISTING_PICTURE_ROUTE).toBe("/api/listing-pictures");
    expect(mockedPrepare).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/listing-pictures?slot=ad_wide",
      expect.objectContaining({ method: "POST", body: cropped, credentials: "same-origin", headers: { "Content-Type": "image/webp" } }),
    );
  });

  it("shows the server's own explanation for a refusal", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Add your business first, then add its pictures." }, { status: 409 }));
    await expect(uploadListingPicture(cropped, "listing")).resolves.toEqual({
      ok: false,
      message: "Add your business first, then add its pictures.",
    });
  });

  it("reports a dropped connection", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadListingPicture(cropped, "listing")).resolves.toEqual({
      ok: false,
      message: "We couldn't upload that file. Check your connection and try again.",
    });
  });
});
