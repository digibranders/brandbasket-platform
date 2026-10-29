import { describe, expect, it } from "vitest";
import { normalizeWebsiteUrl, parseIntakeAnswer } from "@/lib/intake/answers";
import { NO_ANSWERS, type IntakeAnswers } from "@brandbasket/shared/lib/intake/questions";

const clinic: IntakeAnswers = { ...NO_ANSWERS, businessType: "clinic", businessSubtype: "dental" };

describe("a single choice", () => {
  it("takes one of the question's own options", () => {
    expect(parseIntakeAnswer("primaryGoal", ["be_found"], NO_ANSWERS)).toEqual({ ok: true, patch: { primaryGoal: "be_found" } });
  });

  it("refuses a value that is not an option, none, or several", () => {
    for (const raw of [["nonsense"], [], ["be_found", "unsure"], ["", ""]]) {
      expect(parseIntakeAnswer("primaryGoal", raw, NO_ANSWERS)).toMatchObject({ ok: false });
    }
  });

  it("takes the kind of practice only from the options of the chosen business, so a clinic cannot be a gym", () => {
    expect(parseIntakeAnswer("businessSubtype", ["dental"], clinic)).toMatchObject({ ok: true });
    expect(parseIntakeAnswer("businessSubtype", ["gym"], clinic)).toMatchObject({ ok: false });
    expect(parseIntakeAnswer("businessSubtype", ["dental"], NO_ANSWERS)).toMatchObject({ ok: false });
  });

  it("forgets the kind of practice when the business changes, and keeps it when it does not", () => {
    expect(parseIntakeAnswer("businessType", ["salon"], clinic)).toEqual({ ok: true, patch: { businessType: "salon", businessSubtype: null } });
    expect(parseIntakeAnswer("businessType", ["clinic"], clinic)).toEqual({ ok: true, patch: { businessType: "clinic" } });
  });

  it("forgets the website address when there is no website", () => {
    expect(parseIntakeAnswer("websiteState", ["no_site"], { ...NO_ANSWERS, existingWebsiteUrl: "https://old.in" })).toEqual({
      ok: true,
      patch: { websiteState: "no_site", existingWebsiteUrl: null },
    });
  });

  it("refuses a question it does not know", () => {
    expect(parseIntakeAnswer("businessId", ["x"], NO_ANSWERS)).toMatchObject({ ok: false });
  });
});

describe("several choices", () => {
  it("takes channels from the options, once each", () => {
    expect(parseIntakeAnswer("socialChannels", ["instagram", "facebook", "instagram"], NO_ANSWERS)).toEqual({ ok: true, patch: { socialChannels: ["instagram", "facebook"] } });
  });

  it("makes 'let BrandBasket recommend' the whole answer", () => {
    expect(parseIntakeAnswer("socialChannels", ["instagram", "recommend"], NO_ANSWERS)).toEqual({ ok: true, patch: { socialChannels: ["recommend"] } });
  });

  it("refuses none, or a channel that is not offered", () => {
    expect(parseIntakeAnswer("socialChannels", [], NO_ANSWERS)).toMatchObject({ ok: false });
    expect(parseIntakeAnswer("socialChannels", ["tiktok"], NO_ANSWERS)).toMatchObject({ ok: false });
  });
});

describe("the website address", () => {
  it("is stored as an https address, trimmed", () => {
    expect(parseIntakeAnswer("existingWebsiteUrl", ["  sharmadental.in  "], NO_ANSWERS)).toEqual({ ok: true, patch: { existingWebsiteUrl: "https://sharmadental.in" } });
    expect(normalizeWebsiteUrl("http://shop.in/menu?x=1")).toBe("http://shop.in/menu?x=1");
  });

  it("is cleared by an empty answer, which passes the question over", () => {
    expect(parseIntakeAnswer("existingWebsiteUrl", ["  "], NO_ANSWERS)).toEqual({ ok: true, patch: { existingWebsiteUrl: null } });
  });

  it("refuses what is not an address: no dot, spaces, other schemes, a password in it, or too long", () => {
    for (const text of ["localhost", "my shop.in", "javascript:alert(1)", "ftp://x.in", "https://user:pw@x.in", `https://${"a".repeat(300)}.in`]) {
      expect(normalizeWebsiteUrl(text), text).toBeNull();
    }
  });
});
