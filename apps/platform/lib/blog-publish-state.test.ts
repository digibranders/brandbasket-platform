import { describe, expect, it } from "vitest";
import { blogPublishState } from "./blog-publish-state";

const NOW = Date.UTC(2026, 8, 30, 12);

describe("blogPublishState", () => {
  it("is a draft whatever its date", () => {
    expect(blogPublishState("draft", null, NOW)).toBe("draft");
    expect(blogPublishState("draft", NOW + 60_000, NOW)).toBe("draft");
  });

  it("is scheduled while a published post's date is ahead", () => {
    expect(blogPublishState("published", NOW + 60_000, NOW)).toBe("scheduled");
  });

  it("is published once its date has come, or when it has none", () => {
    expect(blogPublishState("published", NOW, NOW)).toBe("published");
    expect(blogPublishState("published", NOW - 60_000, NOW)).toBe("published");
    expect(blogPublishState("published", null, NOW)).toBe("published");
  });
});
