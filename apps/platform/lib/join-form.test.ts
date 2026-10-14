import { describe, expect, it } from "vitest";
import { parseJoinForm, readJoinChoice } from "./join-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const account = { choice: "listing_only", name: " Meera Shah ", phone: " 98200 11223 ", password: "correct-horse-battery", agree: "yes" };
const claim = {
  ...account,
  listing: "dentists/thane/naupada/smile-dental",
  businessName: "Smile Dental",
  sig: "c2lnbmVkLWJ5LXRoZS13ZWJzaXRl",
};
/** The claim's fields with the business named by its permanent id instead of its listing key. */
function claimById(id: string): Record<string, string> {
  const { businessName, sig } = claim;
  return { ...account, id, businessName, sig };
}
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

describe("parseJoinForm", () => {
  it("reads a new business's sign-up: a name, a mobile number and a password, and no code yet", () => {
    expect(parseJoinForm(form(account))).toEqual({
      success: true,
      data: {
        kind: "new",
        choice: "listing_only",
        businessName: null,
        name: "Meera Shah",
        phone: "98200 11223",
        password: "correct-horse-battery",
        agreed: true,
        code: null,
      },
    });
  });

  it("reads a claim: the listing, its name and the link's signature as well", () => {
    expect(parseJoinForm(form(claim))).toEqual({
      success: true,
      data: {
        kind: "claim",
        choice: "listing_only",
        listing: "dentists/thane/naupada/smile-dental",
        businessName: "Smile Dental",
        signature: "c2lnbmVkLWJ5LXRoZS13ZWJzaXRl",
        name: "Meera Shah",
        phone: "98200 11223",
        password: "correct-horse-battery",
        agreed: true,
        code: null,
      },
    });
  });

  it("refuses a sign-up whose terms box is not ticked, however the rest of the form reads", () => {
    const unticked = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "agree"));
    expect(parseJoinForm(form(unticked))).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
    expect(parseJoinForm(form({ ...account, agree: "no" }))).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
    expect(parseJoinForm(form({ ...claim, agree: "" }))).toMatchObject({ success: false });
  });

  it("asks for the tick again on the code step, which sends the form's fields a second time", () => {
    const unticked = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "agree"));
    expect(parseJoinForm(form({ ...unticked, otpId: OTP_ID, code: "123456" }))).toMatchObject({ success: false });
    expect(parseJoinForm(form({ ...account, otpId: OTP_ID, code: "123456" }))).toMatchObject({ success: true, data: { agreed: true } });
  });

  it("reads the code step: the code we texted and which one it answers, spaces dropped", () => {
    expect(parseJoinForm(form({ ...account, otpId: OTP_ID, code: " 123 456 " }))).toMatchObject({
      success: true,
      data: { kind: "new", code: { otpId: OTP_ID, code: "123456" } },
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
      expect(parseJoinForm(form({ ...account, businessName: "Smile Dental", choice }))).toMatchObject({ success: true, data: { kind: "new", choice } });
      expect(parseJoinForm(form({ ...claim, choice }))).toMatchObject({ success: true, data: { kind: "claim", choice } });
    }
  });

  it("asks a Care sign-up for the business's name too, since it pays before anything else", () => {
    const care = { ...account, choice: "care" };
    expect(parseJoinForm(form(care))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...care, businessName: "Smile Dental" }))).toMatchObject({
      success: true,
      data: { kind: "new", choice: "care", businessName: "Smile Dental" },
    });
  });

  it("asks a Premium sign-up for the business's name, as one clean line", () => {
    const premium = { ...account, choice: "premium" };
    expect(parseJoinForm(form(premium))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...premium, businessName: "  " }))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...premium, businessName: " Smile\n Dental\u0007 " }))).toMatchObject({
      success: true,
      data: { kind: "new", choice: "premium", businessName: "Smile Dental" },
    });
    expect(parseJoinForm(form({ ...premium, businessName: "x".repeat(201) }))).toEqual({ success: false, message: "That business name is too long." });
  });

  it("takes no business name from a free sign-up, which names the business when it adds it", () => {
    expect(parseJoinForm(form({ ...account, businessName: "Smile Dental" }))).toMatchObject({ success: true, data: { businessName: null } });
  });

  it("asks for a plan when the form carries none, or one it never offered, including the retired website question's answer", () => {
    const unanswered = { name: account.name, phone: account.phone, password: account.password };
    const refusal = { success: false, message: "Choose a plan to continue." };
    expect(parseJoinForm(form(unanswered))).toEqual(refusal);
    expect(parseJoinForm(form({ ...account, choice: "website" }))).toEqual(refusal);
    expect(parseJoinForm(form({ ...account, choice: "own_website" }))).toEqual(refusal);
  });

  it("asks for a name, a mobile number and a long enough password", () => {
    expect(parseJoinForm(form({ ...account, name: " " }))).toEqual({ success: false, message: "Tell us your name." });
    expect(parseJoinForm(form({ ...account, phone: "" }))).toEqual({ success: false, message: "Enter your mobile number." });
    expect(parseJoinForm(form({ ...account, password: "short" }))).toEqual({
      success: false,
      message: "Use at least 10 characters for the password.",
    });
  });

  it("refuses a listing that is not a listing key", () => {
    expect(parseJoinForm(form({ ...claim, listing: "not a key" }))).toEqual({
      success: false,
      message: "This link is missing the business. Open it again from the business's page.",
    });
  });

  it("reads a claim by permanent id: the place id in place of the listing key", () => {
    expect(parseJoinForm(form(claimById("k7m2q9a")))).toEqual({
      success: true,
      data: {
        kind: "claim",
        choice: "listing_only",
        placeId: "k7m2q9a",
        businessName: "Smile Dental",
        signature: "c2lnbmVkLWJ5LXRoZS13ZWJzaXRl",
        name: "Meera Shah",
        phone: "98200 11223",
        password: "correct-horse-battery",
        agreed: true,
        code: null,
      },
    });
  });

  it("refuses an id that is not a place id", () => {
    for (const id of ["K7M2Q9A", "k7m2q9", "abcdefg", "k7m2q9a1", "dentists/thane/naupada/smile-dental"]) {
      expect(parseJoinForm(form(claimById(id)))).toEqual({
        success: false,
        message: "This link is missing the business. Open it again from the business's page.",
      });
    }
  });

  it("refuses a link that names the business by both its key and its id", () => {
    expect(parseJoinForm(form({ ...claim, id: "k7m2q9a" }))).toEqual({
      success: false,
      message: "This link is missing the business. Open it again from the business's page.",
    });
  });

  it("refuses a claim whose link carries no signature", () => {
    expect(parseJoinForm(form({ ...claim, sig: "" }))).toEqual({
      success: false,
      message: "This link is incomplete. Open it again from the business's page.",
    });
  });

  it("strips line breaks and control characters from a claimed business's name", () => {
    expect(parseJoinForm(form({ ...claim, businessName: "Smile\nDental\u0007" }))).toMatchObject({
      success: true,
      data: { kind: "claim", businessName: "Smile Dental" },
    });
  });
});

describe("parseJoinForm with an email address (the Fynix sign-up)", () => {
  const emailAccount = { choice: "care", businessName: " Smile Dental ", name: " Meera Shah ", email: "  Meera.Shah@Example.TEST ", password: "correct-horse-battery", agree: "yes" };
  const parse = (entries: Record<string, string>) => parseJoinForm(form(entries), "email");

  it("reads a name, an email address (trimmed, lowercase) and a password, with no phone and no code yet", () => {
    expect(parse(emailAccount)).toEqual({
      success: true,
      data: {
        kind: "new",
        choice: "care",
        businessName: "Smile Dental",
        name: "Meera Shah",
        email: "meera.shah@example.test",
        password: "correct-horse-battery",
        agreed: true,
        code: null,
      },
    });
  });

  it("never asks for a mobile number, and ignores one it is sent", () => {
    const parsed = parse({ ...emailAccount, phone: "98200 11223" });
    expect(parsed).toMatchObject({ success: true });
    expect(parsed.success && "phone" in parsed.data ? parsed.data.phone : undefined).toBeUndefined();
  });

  it("asks for an email address, and for a real one", () => {
    expect(parse({ ...emailAccount, email: "" })).toEqual({ success: false, message: "Enter your email address." });
    for (const email of ["meera", "meera@", "@example.test", "meera shah@example.test", "a@b", `${"x".repeat(250)}@example.test`]) {
      expect(parse({ ...emailAccount, email })).toEqual({ success: false, message: "Enter a valid email address." });
    }
  });

  it("reads the code step: the code we emailed and which one it answers, spaces dropped", () => {
    expect(parse({ ...emailAccount, otpId: OTP_ID, code: " 123 456 " })).toMatchObject({
      success: true,
      data: { kind: "new", email: "meera.shah@example.test", code: { otpId: OTP_ID, code: "123456" } },
    });
    expect(parse({ ...emailAccount, otpId: OTP_ID, code: "12ab" })).toEqual({ success: false, message: "Enter a 6-digit code." });
  });

  it("keeps the other rules: a plan, the terms box, a long enough password, and the business's name for a paid plan", () => {
    expect(parse({ ...emailAccount, choice: "" })).toEqual({ success: false, message: "Choose a plan to continue." });
    expect(parse({ ...emailAccount, agree: "" })).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
    expect(parse({ ...emailAccount, password: "short" })).toEqual({ success: false, message: "Use at least 10 characters for the password." });
    expect(parse({ ...emailAccount, businessName: " " })).toEqual({ success: false, message: "Tell us your business's name." });
  });

  it("still reads a mobile number when no mode is given, as before", () => {
    expect(parseJoinForm(form({ ...account, email: "meera@example.test" }))).toMatchObject({ success: true, data: { phone: "98200 11223" } });
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
