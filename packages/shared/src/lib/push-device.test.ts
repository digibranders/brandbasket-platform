import { describe, expect, it } from "vitest";
import { classifyPushEnvironment, parsePushSubscription, publicVapidKey, urlBase64ToBytes } from "./push-device";

const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: KEYS };

describe("urlBase64ToBytes", () => {
  it("decodes the url-safe base64 a VAPID key is written in", () => {
    expect(Array.from(urlBase64ToBytes("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToBytes("-_8"))).toEqual([251, 255]);
  });
});

describe("publicVapidKey", () => {
  it("prefers the runtime key, falls back to the NEXT_PUBLIC one, and is null when neither is set", () => {
    expect(publicVapidKey({ VAPID_PUBLIC_KEY: " a ", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "b" })).toBe("a");
    expect(publicVapidKey({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: "b" })).toBe("b");
    expect(publicVapidKey({ VAPID_PUBLIC_KEY: "  " })).toBeNull();
  });
});

describe("classifyPushEnvironment", () => {
  const base = { hasServiceWorker: true, hasPushManager: true, hasNotification: true, permission: "default" as const, ios: false, standalone: false };

  it("is ready when the browser can push and nothing is refused", () => {
    expect(classifyPushEnvironment(base)).toBe("ready");
  });

  it("is blocked when the person refused notifications in the browser", () => {
    expect(classifyPushEnvironment({ ...base, permission: "denied" })).toBe("blocked");
  });

  it("asks an iPhone browser tab to add the app to the home screen, and lets the installed app through", () => {
    expect(classifyPushEnvironment({ ...base, ios: true, hasPushManager: false })).toBe("needs-install");
    expect(classifyPushEnvironment({ ...base, ios: true, standalone: true })).toBe("ready");
  });

  it("is unsupported where the browser has no push", () => {
    expect(classifyPushEnvironment({ ...base, hasPushManager: false })).toBe("unsupported");
    expect(classifyPushEnvironment({ ...base, hasServiceWorker: false })).toBe("unsupported");
  });
});

describe("parsePushSubscription", () => {
  it("accepts a subscription from a known push service", () => {
    expect(parsePushSubscription(ok).success).toBe(true);
    for (const endpoint of ["https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
      expect(parsePushSubscription({ ...ok, endpoint }).success).toBe(true);
    }
  });

  it.each([
    "http://fcm.googleapis.com/x",
    "https://127.0.0.1/x",
    "https://localhost/x",
    "https://169.254.169.254/latest",
    "https://evil.example/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://user@fcm.googleapis.com/x",
    "not a url",
  ])("refuses the endpoint %s, which the server would otherwise be asked to call", (endpoint) => {
    expect(parsePushSubscription({ ...ok, endpoint }).success).toBe(false);
  });

  it("refuses missing or oversized keys and an endpoint that is too long", () => {
    expect(parsePushSubscription({ endpoint: ok.endpoint, keys: { p256dh: "", auth: "x" } }).success).toBe(false);
    expect(parsePushSubscription({ endpoint: ok.endpoint }).success).toBe(false);
    expect(parsePushSubscription({ ...ok, endpoint: `https://fcm.googleapis.com/${"a".repeat(2100)}` }).success).toBe(false);
  });
});
