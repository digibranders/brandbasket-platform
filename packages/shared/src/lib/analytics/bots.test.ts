import { describe, expect, it } from "vitest";
import { isBot } from "./bots";

describe("isBot", () => {
  it("lets a real browser through", () => {
    expect(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")).toBe(false);
    expect(isBot("Mozilla/5.0 (Linux; Android 11; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36")).toBe(false);
  });

  it("drops crawlers, link previews, headless browsers and scripts", () => {
    for (const agent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "WhatsApp/2.23.20 A",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
      "Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)",
      "Chrome-Lighthouse",
      "curl/8.4.0",
      "python-requests/2.31",
      "Mozilla/5.0 (compatible; SomeSpider/1.0)",
    ]) {
      expect(isBot(agent), agent).toBe(true);
    }
  });

  it("drops a request with no user agent", () => {
    expect(isBot("")).toBe(true);
    expect(isBot("   ")).toBe(true);
  });
});
