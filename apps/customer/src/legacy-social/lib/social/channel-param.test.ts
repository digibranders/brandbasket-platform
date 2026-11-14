import { describe, expect, it } from "vitest";
import { channelParamOf, withChannel } from "./channel-param";

describe("the channel kept in the address", () => {
  it("reads a network or all, and nothing else", () => {
    expect(channelParamOf("instagram")).toBe("instagram");
    expect(channelParamOf("all")).toBe("all");
    expect(channelParamOf("tiktok")).toBeNull();
    expect(channelParamOf(null)).toBeNull();
    expect(channelParamOf(undefined)).toBeNull();
  });

  it("puts it in an address, replacing what was there, and leaves an address with none as it is", () => {
    expect(withChannel("/social/review", "facebook")).toBe("/social/review?channel=facebook");
    expect(withChannel("/social?channel=instagram", "all")).toBe("/social?channel=all");
    expect(withChannel("/social", null)).toBe("/social");
  });
});
