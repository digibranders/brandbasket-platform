import { describe, expect, it } from "vitest";
import { isPlaceId, isPlatformPlaceId, newPlatformPlaceId } from "./place-id";

describe("place id re-export", () => {
  it("exposes the db package's id format to apps and the website", () => {
    const id = newPlatformPlaceId();
    expect(isPlaceId(id)).toBe(true);
    expect(isPlatformPlaceId(id)).toBe(true);
    expect(isPlaceId("naupada")).toBe(false);
  });
});
