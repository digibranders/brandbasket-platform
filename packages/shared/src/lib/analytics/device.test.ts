import { describe, expect, it } from "vitest";
import { deviceClass } from "./device";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

describe("deviceClass", () => {
  it("tells phones, tablets and desktops apart", () => {
    expect(deviceClass(IPHONE)).toBe("mobile");
    expect(deviceClass(ANDROID_PHONE)).toBe("mobile");
    expect(deviceClass(IPAD)).toBe("tablet");
    expect(deviceClass(ANDROID_TABLET)).toBe("tablet");
    expect(deviceClass(DESKTOP)).toBe("desktop");
  });

  it("calls an empty or unknown string a desktop", () => {
    expect(deviceClass("")).toBe("desktop");
    expect(deviceClass("SomethingElse/1.0")).toBe("desktop");
  });
});
