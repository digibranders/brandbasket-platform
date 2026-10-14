import { describe, expect, it } from "vitest";
import {
  hasSessionCookie,
  hintCookieDomain,
  hintCookieOptions,
  hintUpdate,
  SIGNED_IN_HINT_MAX_AGE_SECONDS,
  signedInHintValue,
  UNKNOWN_INITIALS,
} from "./signed-in-hint";

describe("signedInHintValue", () => {
  it("is the person's initials, the same the dashboard draws", () => {
    expect(signedInHintValue("Dr Kiran Tester")).toBe("DT");
    expect(signedInHintValue("meera")).toBe("M");
  });

  it("carries a name in any script safely in a cookie", () => {
    expect(decodeURIComponent(signedInHintValue("अनिल मेहता"))).toBe("अम");
  });

  it("still says signed in when there is no name to take initials from", () => {
    expect(signedInHintValue("   ")).toBe(UNKNOWN_INITIALS);
  });
});

describe("hasSessionCookie", () => {
  it("sees the login on plain http and behind https's __Secure- prefix", () => {
    expect(hasSessionCookie((name) => name === "better-auth.session_token")).toBe(true);
    expect(hasSessionCookie((name) => name === "__Secure-better-auth.session_token")).toBe(true);
  });

  it("sees no login without either", () => {
    expect(hasSessionCookie(() => false)).toBe(false);
  });
});

describe("hintUpdate", () => {
  it("renews the marker while the login lasts, keeping its initials", () => {
    expect(hintUpdate({ hasSession: true, hint: "DT" })).toEqual({ kind: "set", value: "DT" });
  });

  it("marks a login made before the marker existed, without initials", () => {
    expect(hintUpdate({ hasSession: true, hint: null })).toEqual({ kind: "set", value: UNKNOWN_INITIALS });
  });

  it("takes the marker away once the login is gone", () => {
    expect(hintUpdate({ hasSession: false, hint: "DT" })).toEqual({ kind: "clear" });
  });

  it("does nothing for a visitor who was never signed in", () => {
    expect(hintUpdate({ hasSession: false, hint: null })).toEqual({ kind: "none" });
  });
});

describe("hintCookieDomain", () => {
  it("is unset when none is configured, so the marker stays on the dashboard's own host", () => {
    expect(hintCookieDomain(undefined, "https://app.firstfold.io")).toBeUndefined();
    expect(hintCookieDomain("", "https://app.firstfold.io")).toBeUndefined();
  });

  it("is the parent domain the website and the dashboard share", () => {
    expect(hintCookieDomain("firstfold.io", "https://app.firstfold.io")).toBe("firstfold.io");
    expect(hintCookieDomain(".FirstFold.io", "https://app.firstfold.io")).toBe("firstfold.io");
  });

  it("refuses a domain the dashboard is not on, which browsers would drop the cookie for", () => {
    expect(() => hintCookieDomain("example.com", "https://app.firstfold.io")).toThrow(/SIGNED_IN_HINT_DOMAIN/);
    expect(() => hintCookieDomain("io", "https://app.firstfold.io")).toThrow(/SIGNED_IN_HINT_DOMAIN/);
    expect(() => hintCookieDomain("notfirstfold.io", "https://app.firstfold.io")).toThrow(/SIGNED_IN_HINT_DOMAIN/);
  });
});

describe("hintCookieOptions", () => {
  it("is readable by the website's script, sent on its pages, and secure over https", () => {
    expect(hintCookieOptions({ appOrigin: "https://app.firstfold.io", domain: "firstfold.io" })).toEqual({
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: SIGNED_IN_HINT_MAX_AGE_SECONDS,
      domain: "firstfold.io",
    });
  });

  it("works on a local http dashboard, with no domain", () => {
    expect(hintCookieOptions({ appOrigin: "http://localhost:3081", domain: undefined })).toEqual({
      httpOnly: false,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SIGNED_IN_HINT_MAX_AGE_SECONDS,
    });
  });
});
