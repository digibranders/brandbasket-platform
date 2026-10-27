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
    expect(init.redirect).toBe("manual");
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

  it("stops reading a chunked answer with no length header once it passes 6 MB, and cancels the stream", async () => {
    const cancel = vi.fn();
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(chunk);
        if (sent > 50) controller.close();
      },
      cancel,
    });
    const fetchStub = vi.fn().mockResolvedValue(new Response(stream, { headers: { "content-type": "image/png" } }));
    await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(/too large/i);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(sent).toBeLessThan(10);
  });

  it("accepts a body just under the cap, read as a stream", async () => {
    const image = await png(100, 60);
    const padded = Buffer.concat([image, Buffer.alloc(6 * 1024 * 1024 - 1 - image.byteLength)]);
    const fetchStub = vi.fn().mockResolvedValue(answer(padded, "image/png"));
    const out = await captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE });
    expect([out.width, out.height]).toEqual([100, 60]);
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

  describe("redirects", () => {
    const redirect = (location: string, status = 302): Response => new Response(null, { status, headers: { location } });

    it("follows an https redirect to a public host, then reads the picture", async () => {
      const fetchStub = vi
        .fn()
        .mockResolvedValueOnce(redirect("https://cdn.example.com/x.webp"))
        .mockResolvedValueOnce(answer(await png(100, 60), "image/png"));
      const out = await captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE });
      expect(out.width).toBe(100);
      expect(fetchStub.mock.calls[1]?.[0]).toBe("https://cdn.example.com/x.webp");
      expect((fetchStub.mock.calls[1]?.[1] as RequestInit).redirect).toBe("manual");
    });

    it("resolves a relative Location against the current address", async () => {
      const fetchStub = vi
        .fn()
        .mockResolvedValueOnce(redirect("/files/x.png", 301))
        .mockResolvedValueOnce(answer(await png(100, 60), "image/png"));
      await captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE });
      expect(fetchStub.mock.calls[1]?.[0]).toBe("https://shots.example/files/x.png");
    });

    it.each([
      "http://169.254.169.254/latest/meta-data",
      "https://127.0.0.1/x",
      "https://localhost/x",
      "https://app.localhost/x",
      "https://db.internal/x",
      "https://printer.local/x",
      "https://10.0.0.5/x",
      "https://172.16.0.1/x",
      "https://172.31.255.1/x",
      "https://192.168.1.1/x",
      "https://0.0.0.0/x",
      "https://[::1]/x",
      "https://[::]/x",
      "https://[fd00::1]/x",
      "https://[fe80::1]/x",
      "https://[::ffff:127.0.0.1]/x",
      "https://2130706433/x",
    ])("refuses a redirect to %s and does not fetch it", async (location) => {
      const fetchStub = vi.fn().mockResolvedValue(redirect(location));
      await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
      expect(fetchStub).toHaveBeenCalledTimes(1);
    });

    it("allows public addresses next to the blocked ranges", async () => {
      for (const location of ["https://172.32.0.1/x", "https://11.0.0.1/x", "https://[2606:4700::1]/x"]) {
        const fetchStub = vi.fn().mockResolvedValueOnce(redirect(location)).mockResolvedValueOnce(answer(await png(10, 10), "image/png"));
        await captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE });
        expect(fetchStub).toHaveBeenCalledTimes(2);
      }
    });

    it("refuses a redirect with no Location", async () => {
      const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 302 }));
      await expect(captureScreenshot(PREVIEW, { fetch: fetchStub, template: TEMPLATE })).rejects.toThrow(PreviewScreenshotError);
    });

    it("refuses a chain of 4 redirects, but follows 3", async () => {
      const hop = (n: number): Response => redirect(`https://cdn.example.com/${n}`);
      const four = vi.fn().mockImplementation(async () => hop(1));
      await expect(captureScreenshot(PREVIEW, { fetch: four, template: TEMPLATE })).rejects.toThrow(/redirected too many times/i);
      expect(four).toHaveBeenCalledTimes(4);

      const three = vi
        .fn()
        .mockResolvedValueOnce(hop(1))
        .mockResolvedValueOnce(hop(2))
        .mockResolvedValueOnce(hop(3))
        .mockResolvedValueOnce(answer(await png(10, 10), "image/png"));
      await expect(captureScreenshot(PREVIEW, { fetch: three, template: TEMPLATE })).resolves.toBeDefined();
    });
  });
});
