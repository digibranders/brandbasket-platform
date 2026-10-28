import { describe, expect, it } from "vitest";
import { classifyChannel, referrerHost } from "./classify-channel";

const OWN = ["saidental.in"];
const base = { medium: null, source: null, ownHosts: OWN } as const;

describe("referrerHost", () => {
  it("gives the host without www", () => {
    expect(referrerHost("https://www.Google.com/search?q=dentist")).toBe("google.com");
    expect(referrerHost("android-app://com.google.android.gm")).toBe("com.google.android.gm");
  });

  it("gives null for nothing usable", () => {
    expect(referrerHost("")).toBeNull();
    expect(referrerHost(undefined)).toBeNull();
    expect(referrerHost("not a url")).toBeNull();
  });
});

describe("classifyChannel", () => {
  it("calls a visit with no referrer and no campaign direct", () => {
    expect(classifyChannel({ ...base, referrerHost: null })).toBe("direct");
  });

  it("recognises search engines in any country", () => {
    for (const host of ["google.com", "google.co.in", "bing.com", "duckduckgo.com", "search.yahoo.com", "yandex.ru", "search.brave.com", "ecosia.org"]) {
      expect(classifyChannel({ ...base, referrerHost: host }), host).toBe("search");
    }
  });

  it("recognises AI assistants before the search engine that hosts one", () => {
    for (const host of ["chatgpt.com", "chat.openai.com", "perplexity.ai", "gemini.google.com", "claude.ai", "copilot.microsoft.com"]) {
      expect(classifyChannel({ ...base, referrerHost: host }), host).toBe("ai");
    }
  });

  it("recognises social networks and their link shorteners", () => {
    for (const host of ["facebook.com", "l.facebook.com", "l.instagram.com", "instagram.com", "lnkd.in", "t.co", "youtube.com", "t.me"]) {
      expect(classifyChannel({ ...base, referrerHost: host }), host).toBe("social");
    }
  });

  it("recognises webmail", () => {
    expect(classifyChannel({ ...base, referrerHost: "mail.google.com" })).toBe("email");
    expect(classifyChannel({ ...base, referrerHost: "outlook.live.com" })).toBe("email");
  });

  it("calls any other site a referral", () => {
    expect(classifyChannel({ ...base, referrerHost: "justdial.com" })).toBe("referral");
  });

  it("treats the business's own site as direct, with or without www", () => {
    expect(classifyChannel({ ...base, referrerHost: "saidental.in" })).toBe("direct");
    expect(classifyChannel({ ...base, referrerHost: "www.saidental.in", ownHosts: ["www.saidental.in"] })).toBe("direct");
    expect(classifyChannel({ ...base, referrerHost: "blog.saidental.in" })).toBe("direct");
  });

  it("lets a campaign medium decide first", () => {
    expect(classifyChannel({ ...base, referrerHost: "google.com", medium: "cpc" })).toBe("paid");
    expect(classifyChannel({ ...base, referrerHost: null, medium: "paid_social" })).toBe("paid");
    expect(classifyChannel({ ...base, referrerHost: null, medium: "email" })).toBe("email");
    expect(classifyChannel({ ...base, referrerHost: null, medium: "social" })).toBe("social");
    expect(classifyChannel({ ...base, referrerHost: null, medium: "organic" })).toBe("search");
  });

  it("reads a campaign source with no medium", () => {
    expect(classifyChannel({ ...base, referrerHost: null, source: "instagram" })).toBe("social");
    expect(classifyChannel({ ...base, referrerHost: null, source: "newsletter" })).toBe("email");
  });

  it("falls back to the referrer when the medium means nothing to us", () => {
    expect(classifyChannel({ ...base, referrerHost: "google.com", medium: "banana" })).toBe("search");
  });
});
