import { describe, expect, it } from "vitest";
import { CHATBOT_NOTICES, chatbotNoticeHref, parseChatbotForm, parseOperatorKeyForm, readChatbotNotice } from "./chatbot-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const KEY = "fedcba9876543210fedcba9876543210";
const GOOD = { name: " Website assistant ", oyechatsBotId: "41", websiteUrl: "https://cafe.example.com", webhookSecret: "0123456789abcdef0123456789abcdef" };

describe("parseChatbotForm", () => {
  it("reads a bot: a trimmed name, OyeChats' bot number, the site and the webhook secret", () => {
    expect(parseChatbotForm(form(GOOD))).toEqual({
      ok: true,
      bot: { name: "Website assistant", oyechatsBotId: 41, websiteUrl: "https://cafe.example.com", webhookSecret: "0123456789abcdef0123456789abcdef", operatorKey: null },
    });
  });

  it("takes the operator key when one is given, and none when it is left blank", () => {
    expect(parseChatbotForm(form({ ...GOOD, operatorKey: ` ${KEY} ` }))).toMatchObject({ ok: true, bot: { operatorKey: KEY } });
    expect(parseChatbotForm(form({ ...GOOD, operatorKey: "  " }))).toMatchObject({ ok: true, bot: { operatorKey: null } });
  });

  it("refuses an operator key that is too short, too long or has whitespace in it", () => {
    for (const value of ["short", "x".repeat(201), "fedcba9876543210 fedcba9876543210"]) {
      expect(parseChatbotForm(form({ ...GOOD, operatorKey: value }))).toEqual({ ok: false, notice: "invalid-operator-key" });
    }
  });

  it("takes a blank website as none", () => {
    expect(parseChatbotForm(form({ ...GOOD, websiteUrl: "  " }))).toMatchObject({ ok: true, bot: { websiteUrl: null } });
  });

  it("refuses a missing or overlong name", () => {
    expect(parseChatbotForm(form({ ...GOOD, name: "  " }))).toEqual({ ok: false, notice: "invalid-name" });
    expect(parseChatbotForm(form({ ...GOOD, name: "x".repeat(81) }))).toEqual({ ok: false, notice: "invalid-name" });
  });

  it("refuses a bot number that is not a whole positive number", () => {
    for (const value of ["", "0", "-3", "4.5", "abc", "41abc", "99999999999999"]) {
      expect(parseChatbotForm(form({ ...GOOD, oyechatsBotId: value }))).toEqual({ ok: false, notice: "invalid-bot-id" });
    }
  });

  it("refuses a website that is not an http or https address, or has spaces", () => {
    for (const value of ["javascript:alert(1)", "cafe.example.com", "ftp://cafe.example.com", "https://cafe example.com", `https://${"a".repeat(300)}.com`]) {
      expect(parseChatbotForm(form({ ...GOOD, websiteUrl: value }))).toEqual({ ok: false, notice: "invalid-website" });
    }
  });

  it("refuses a webhook secret that is too short or has whitespace in it", () => {
    expect(parseChatbotForm(form({ ...GOOD, webhookSecret: "short" }))).toEqual({ ok: false, notice: "invalid-secret" });
    expect(parseChatbotForm(form({ ...GOOD, webhookSecret: "0123456789abcdef 0123456789abcdef" }))).toEqual({ ok: false, notice: "invalid-secret" });
  });
});

describe("parseOperatorKeyForm", () => {
  it("saves the key typed, trimmed", () => {
    expect(parseOperatorKeyForm(form({ operatorKey: ` ${KEY} ` }))).toEqual({ ok: true, operatorKey: KEY });
  });

  it("removes the stored key when asked to, whatever the box holds", () => {
    expect(parseOperatorKeyForm(form({ intent: "clear", operatorKey: "" }))).toEqual({ ok: true, operatorKey: null });
  });

  it("refuses to save a blank or malformed key, rather than clearing by accident", () => {
    for (const value of ["", "   ", "short", "fedcba9876543210 fedcba9876543210"]) {
      expect(parseOperatorKeyForm(form({ operatorKey: value }))).toEqual({ ok: false, notice: "invalid-operator-key" });
    }
  });
});

describe("chatbot notices", () => {
  it("links back to the client's Chatbot section with a key only", () => {
    expect(chatbotNoticeHref("0192f3c4-1111-7000-8000-000000000001", "added")).toBe("/clients/0192f3c4-1111-7000-8000-000000000001?chatbots=added#chatbots");
  });

  it("reads only keys it knows, so nothing from the address is ever shown", () => {
    expect(readChatbotNotice("added")).toBe("added");
    expect(readChatbotNotice("<script>")).toBeNull();
    expect(readChatbotNotice(["added", "removed"])).toBeNull();
    expect(readChatbotNotice(undefined)).toBeNull();
  });

  it("uses no em or en dashes and no exclamation marks", () => {
    expect(JSON.stringify(CHATBOT_NOTICES)).not.toMatch(/[–—!]/);
  });
});
