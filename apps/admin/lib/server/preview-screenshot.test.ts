import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureScreenshot, PreviewScreenshotError } from "./preview-screenshot";

vi.mock("server-only", () => ({}));

const TEMPLATE = "https://shots.example/take?url={url}&w=1280";
const PREVIEW = "https://preview.example/a b?x=1&y=2#top";

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
}

function answer(body: Buffer | string, type: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), { status, headers: { "content-type": type, ...extra } });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("captureScreenshot", () => {
  it("turns a good PNG into a webp 1280 wide, under the limit, and asks only the provider", async () => {
    const fetchStub = vi.fn().mockResolvedValue(answer(await png(1600, 1000), "image/png"));
    const out = await captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE });

    expect(out.width).toBe(1280);
    expect(out.height).toBe(800);
    expect(out.image.byteLength).toBeLessThan(900 * 1024);
    const meta = await sharp(out.image).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1280, 800]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [address, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect(address).toBe(`https://shots.example/take?url=${encodeURIComponent(PREVIEW)}&w=1280`);
    expect(init.redirect).toBe("follow");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never enlarges a small picture", async () => {
    const fetchStub = vi.fn().mockResolvedValue(answer(await png(640, 400), "image/jpeg"));
    const out = await captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE });
    expect([out.width, out.height]).toEqual([640, 400]);
  });

  it("uses PREVIEW_SCREENSHOT_URL when no template is passed, and Microlink otherwise", async () => {
    const fetchStub = vi.fn().mockImplementation(async () => answer(await png(100, 60), "image/png"));
    vi.stubEnv("PREVIEW_SCREENSHOT_URL", "https://other.example/s?u={url}");
    await captureScreenshot("https://preview.example", { fetch: fetchStub });
    expect(fetchStub.mock.calls[0]?.[0]).toBe(`https://other.example/s?u=${encodeURIComponent("https://preview.example")}`);

    vi.stubEnv("PREVIEW_SCREENSHOT_URL", "");
    await captureScreenshot("https://preview.example", { fetch: fetchStub });
    expect(String(fetchStub.mock.calls[1]?.[0])).toMatch(/^https:\/\/api\.microlink\.io\/\?url=https%3A%2F%2Fpreview\.example&screenshot=true/);
  });

  it("refuses an HTML answer", async () => {
    const fetchStub = vi.fn().mockResolvedValue(answer("<html></html>", "text/html"));
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
  });

  it("refuses an SVG, which is an image the browser would run", async () => {
    const fetchStub = vi.fn().mockResolvedValue(answer("<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"));
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
  });

  it("refuses a 500", async () => {
    const fetchStub = vi.fn().mockResolvedValue(answer("boom", "text/plain", 500));
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
  });

  it("refuses a timeout", async () => {
    const fetchStub = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
  });

  it("refuses an answer over 6 MB, by its length header or by its bytes", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024 + 1);
    const byHeader = vi.fn().mockResolvedValue(answer(await png(10, 10), "image/png", 200, { "content-length": String(big.byteLength) }));
    await expect(captureScreenshot(PREVIEW, { fetch: byHeader, template: TEMPLATE })).rejects.toThrow(/too large/i);
    const byBytes = vi.fn().mockResolvedValue(answer(big, "image/png"));
    await expect(captureScreenshot(PREVIEW, { fetch: byBytes, template: TEMPLATE })).rejects.toThrow(/too large/i);
  });

  it("refuses bytes that are not the picture they claim to be", async () => {
    const fetchStub = vi.fn().mockResolvedValue(answer("not a picture", "image/png"));
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
  });

  it("fetches nothing for a preview address that is not http or https", async () => {
    const fetchStub = vi.fn();
    await expect(captureScreenshot("file:///etc/passwd", { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
    await expect(captureScreenshot("not a url", { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("fetches nothing when the template has no place for the address, or puts it in the host", async () => {
    const fetchStub = vi.fn();
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: "https://shots.example/take" })).rejects.toThrow(PreviewScreenshotError);
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: "https://{url}.shots.example/" })).rejects.toThrow(PreviewScreenshotError);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
