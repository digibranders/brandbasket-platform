import { describe, expect, it, vi } from "vitest";
import { previewCodeOf, privately } from "@/lib/server/preview-picture";

vi.mock("server-only", () => ({}));

describe("previewCodeOf", () => {
  it("reads the page address the website says the picture is for", () => {
    expect(previewCodeOf(new Request("https://app.test/api/directory/pictures/x?previewFor=rxxyr6q43d"))).toBe("rxxyr6q43d");
  });

  it("is an ordinary request without one, or with something that is not a page address", () => {
    expect(previewCodeOf(new Request("https://app.test/api/directory/pictures/x"))).toBeNull();
    expect(previewCodeOf(new Request("https://app.test/api/directory/pictures/x?previewFor=../etc"))).toBeNull();
    expect(previewCodeOf(new Request("https://app.test/api/directory/pictures/x?previewFor="))).toBeNull();
  });
});

describe("privately", () => {
  it("keeps the answer out of every cache and drops what could validate it", async () => {
    const original = new Response("bytes", { status: 200, headers: { "Cache-Control": "public, max-age=86400", ETag: '"abc"', "Content-Type": "image/webp" } });
    const answer = privately(original);
    expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    expect(answer.headers.has("ETag")).toBe(false);
    expect(answer.headers.get("Content-Type")).toBe("image/webp");
    expect(await answer.text()).toBe("bytes");
  });
});
