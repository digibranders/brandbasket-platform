import { describe, expect, it } from "vitest";
import { socialAiEnabled } from "./social-ai-flag";

describe("socialAiEnabled", () => {
  it("is on only when SOCIAL_AUTO_AI is exactly 1", () => {
    expect(socialAiEnabled({ SOCIAL_AUTO_AI: "1" })).toBe(true);
    expect(socialAiEnabled({ SOCIAL_AUTO_AI: " 1 " })).toBe(true);
    expect(socialAiEnabled({})).toBe(false);
    expect(socialAiEnabled({ SOCIAL_AUTO_AI: "true" })).toBe(false);
    expect(socialAiEnabled({ SOCIAL_AUTO_AI: "0" })).toBe(false);
  });
});
