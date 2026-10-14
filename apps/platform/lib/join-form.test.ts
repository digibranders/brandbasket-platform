import { describe, expect, it } from "vitest";
import { parseJoinForm, readJoinChoice } from "./join-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const account = {
  choice: "listing_only",
  name: " Meera Shah ",
  email: "  Meera.Shah@Example.TEST ",
  password: "correct-horse-battery",
  agree: "yes",
};
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("parseJoinForm", () => {
  it("reads a sign-up: a name, an email address (trimmed, lowercase) and a password, and no code yet", () => {
    expect(parseJoinForm(form(account))).toEqual({
      success: true,
      data: {
        choice: "listing_only",
        businessName: null,
        name: "Meera Shah",
        email: "meera.shah@example.test",
        password: "correct-horse-battery",
        agreed: true,
        code: null,
      },
    });
  });

  it("never asks for a mobile number, and ignores one it is sent", () => {
    const parsed = parseJoinForm(form({ ...account, phone: "98200 11223" }));
    expect(parsed).toMatchObject({ success: true });
    expect(parsed.success && "phone" in parsed.data).toBe(false);
  });

  it("ignores the listing a directory claim link names: a claim is proven by a call to the listing's number, and no account here has one", () => {
    const parsed = parseJoinForm(form({ ...account, listing: "dentists/thane/naupada/smile-dental", id: "k7m2q9a", sig: "c2ln" }));
    expect(parsed).toMatchObject({ success: true, data: { businessName: null } });
    expect(parsed.success && ("kind" in parsed.data || "listing" in parsed.data || "placeId" in parsed.data)).toBe(false);
  });

  it("refuses a sign-up whose terms box is not ticked, however the rest of the form reads", () => {
    const unticked = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "agree"));
    expect(parseJoinForm(form(unticked))).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
    expect(parseJoinForm(form({ ...account, agree: "no" }))).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
  });

  it("asks for the tick again on the code step, which sends the form's fields a second time", () => {
    const unticked = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "agree"));
    expect(parseJoinForm(form({ ...unticked, otpId: OTP_ID, code: "123456" }))).toMatchObject({ success: false });
    expect(parseJoinForm(form({ ...account, otpId: OTP_ID, code: "123456" }))).toMatchObject({ success: true, data: { agreed: true } });
  });

  it("reads the code step: the code we emailed and which one it answers, spaces dropped", () => {
    expect(parseJoinForm(form({ ...account, otpId: OTP_ID, code: " 123 456 " }))).toMatchObject({
      success: true,
      data: { email: "meera.shah@example.test", code: { otpId: OTP_ID, code: "123456" } },
    });
  });

  it("asks for the code when the code step is sent without one", () => {
    expect(parseJoinForm(form({ ...account, otpId: OTP_ID, code: "" }))).toEqual({
      success: false,
      message: "Enter a 6-digit code.",
    });
    expect(parseJoinForm(form({ ...account, otpId: OTP_ID, code: "12ab" }))).toEqual({
      success: false,
      message: "Enter a 6-digit code.",
    });
  });

  it("reads what the owner wants: only the free listing, the Care plan, or the Premium membership", () => {
    for (const choice of ["listing_only", "care", "premium"] as const) {
      expect(parseJoinForm(form({ ...account, businessName: "Smile Dental", choice }))).toMatchObject({ success: true, data: { choice } });
    }
  });

  it("asks a Care sign-up for the business's name too, since it pays before anything else", () => {
    const care = { ...account, choice: "care" };
    expect(parseJoinForm(form(care))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...care, businessName: "Smile Dental" }))).toMatchObject({
      success: true,
      data: { choice: "care", businessName: "Smile Dental" },
    });
  });

  it("asks a Premium sign-up for the business's name, as one clean line", () => {
    const premium = { ...account, choice: "premium" };
    expect(parseJoinForm(form(premium))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...premium, businessName: "  " }))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...premium, businessName: " Smile\n Dental\u0007 " }))).toMatchObject({
      success: true,
      data: { choice: "premium", businessName: "Smile Dental" },
    });
    expect(parseJoinForm(form({ ...premium, businessName: "x".repeat(201) }))).toEqual({ success: false, message: "That business name is too long." });
  });

  it("takes no business name from a free sign-up, which names the business when it adds it", () => {
    expect(parseJoinForm(form({ ...account, businessName: "Smile Dental" }))).toMatchObject({ success: true, data: { businessName: null } });
  });

  it("asks for a plan when the form carries none, or one it never offered, including the retired website question's answer", () => {
    const unanswered = { name: account.name, email: account.email, password: account.password };
    const refusal = { success: false, message: "Choose a plan to continue." };
    expect(parseJoinForm(form(unanswered))).toEqual(refusal);
    expect(parseJoinForm(form({ ...account, choice: "website" }))).toEqual(refusal);
    expect(parseJoinForm(form({ ...account, choice: "own_website" }))).toEqual(refusal);
  });

  it("asks for a name, an email address and a long enough password, in the order the form shows them", () => {
    expect(parseJoinForm(form({ ...account, name: " " }))).toEqual({ success: false, message: "Tell us your name." });
    expect(parseJoinForm(form({ ...account, email: "" }))).toEqual({ success: false, message: "Enter your email address." });
    expect(parseJoinForm(form({ ...account, password: "short" }))).toEqual({
      success: false,
      message: "Use at least 10 characters for the password.",
    });
  });

  it("asks for a real email address", () => {
    for (const email of ["meera", "meera@", "@example.test", "meera shah@example.test", "a@b", `${"x".repeat(250)}@example.test`]) {
      expect(parseJoinForm(form({ ...account, email }))).toEqual({ success: false, message: "Enter a valid email address." });
    }
  });

  it("keeps the other rules: a plan, the terms box, a long enough password, and the business's name for a paid plan", () => {
    const care = { ...account, choice: "care", businessName: " Smile Dental " };
    expect(parseJoinForm(form({ ...care, choice: "" }))).toEqual({ success: false, message: "Choose a plan to continue." });
    expect(parseJoinForm(form({ ...care, agree: "" }))).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
    expect(parseJoinForm(form({ ...care, password: "short" }))).toEqual({ success: false, message: "Use at least 10 characters for the password." });
    expect(parseJoinForm(form({ ...care, businessName: " " }))).toEqual({ success: false, message: "Tell us your business's name." });
  });
});

describe("readJoinChoice", () => {
  it("reads one of the three choices, and nothing else", () => {
    expect(readJoinChoice("premium")).toBe("premium");
    expect(readJoinChoice("care")).toBe("care");
    expect(readJoinChoice("own_website")).toBeNull();
    expect(readJoinChoice("listing_only")).toBe("listing_only");
    expect(readJoinChoice("Premium")).toBeNull();
    expect(readJoinChoice(undefined)).toBeNull();
    expect(readJoinChoice(["premium"])).toBeNull();
  });
});
