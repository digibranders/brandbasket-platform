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
  password: "correct-horse-battery-9",
  country: "IN",
  stateCode: "mh",
  phoneCountry: "IN",
  phone: " 98200 11223 ",
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
        password: "correct-horse-battery-9",
        country: "IN",
        stateCode: "mh",
        phone: { country: "IN", number: "98200 11223" },
        agreed: true,
        code: null,
      },
    });
  });

  it("asks for a country, and for an Indian owner a state they pick themselves", () => {
    const noCountry = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "country"));
    expect(parseJoinForm(form(noCountry))).toEqual({ success: false, message: "Choose your country." });
    expect(parseJoinForm(form({ ...account, country: "XX" }))).toEqual({ success: false, message: "Choose your country." });
    expect(parseJoinForm(form({ ...account, country: "in" }))).toEqual({ success: false, message: "Choose your country." });
    const noState = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "stateCode"));
    expect(parseJoinForm(form(noState))).toEqual({ success: false, message: "Choose your state." });
    expect(parseJoinForm(form({ ...account, stateCode: "zz" }))).toEqual({ success: false, message: "Choose your state." });
    expect(parseJoinForm(form({ ...account, stateCode: "" }))).toEqual({ success: false, message: "Choose your state." });
  });

  it("asks no state outside India, and keeps none whatever the form sent", () => {
    const noState = Object.fromEntries(Object.entries(account).filter(([key]) => key !== "stateCode"));
    expect(parseJoinForm(form({ ...noState, country: "AE" }))).toMatchObject({ success: true, data: { country: "AE", stateCode: null } });
    expect(parseJoinForm(form({ ...account, country: "AE" }))).toMatchObject({ success: true, data: { country: "AE", stateCode: null } });
  });

  it("asks for a mobile number: the country code the owner picked and the number as typed, trimmed", () => {
    expect(parseJoinForm(form({ ...account, phoneCountry: "AE", phone: "  50 123 4567" }))).toMatchObject({
      success: true,
      data: { phone: { country: "AE", number: "50 123 4567" } },
    });
  });

  it("refuses a sign-up with no mobile number, a blank one, one that is too long or no country code", () => {
    const without = (key: string): Record<string, string> => Object.fromEntries(Object.entries(account).filter(([name]) => name !== key));
    expect(parseJoinForm(form(without("phone")))).toEqual({ success: false, message: "Enter your mobile number." });
    expect(parseJoinForm(form({ ...account, phone: "   " }))).toEqual({ success: false, message: "Enter your mobile number." });
    expect(parseJoinForm(form({ ...account, phone: "9".repeat(41) }))).toEqual({ success: false, message: "That phone number is too long." });
    expect(parseJoinForm(form(without("phoneCountry")))).toEqual({ success: false, message: "Choose your country code." });
    expect(parseJoinForm(form({ ...account, phoneCountry: "in" }))).toEqual({ success: false, message: "Choose your country code." });
  });

  it("asks for the mobile number again on the code step, which sends the form's fields a second time", () => {
    const without = Object.fromEntries(Object.entries(account).filter(([name]) => name !== "phone"));
    expect(parseJoinForm(form({ ...without, otpId: OTP_ID, code: "123456" }))).toMatchObject({ success: false });
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

  it("reads what the owner wants: only the free listing or Managed Website", () => {
    for (const choice of ["listing_only", "managed"] as const) {
      expect(parseJoinForm(form({ ...account, businessName: "Smile Dental", choice }))).toMatchObject({ success: true, data: { choice } });
    }
  });

  it("asks a Managed Website sign-up for the business's name, as one clean line, since it pays before anything else", () => {
    const managed = { ...account, choice: "managed" };
    expect(parseJoinForm(form(managed))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...managed, businessName: "  " }))).toEqual({ success: false, message: "Tell us your business's name." });
    expect(parseJoinForm(form({ ...managed, businessName: " Smile\n Dental\u0007 " }))).toMatchObject({
      success: true,
      data: { choice: "managed", businessName: "Smile Dental" },
    });
    expect(parseJoinForm(form({ ...managed, businessName: "x".repeat(201) }))).toEqual({ success: false, message: "That business name is too long." });
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
    expect(parseJoinForm(form({ ...account, businessName: "Smile Dental", choice: "care" }))).toEqual(refusal);
    expect(parseJoinForm(form({ ...account, businessName: "Smile Dental", choice: "premium" }))).toEqual(refusal);
  });

  it("asks for a name, an email address and a long enough password, in the order the form shows them", () => {
    expect(parseJoinForm(form({ ...account, name: " " }))).toEqual({ success: false, message: "Tell us your name." });
    expect(parseJoinForm(form({ ...account, email: "" }))).toEqual({ success: false, message: "Enter your email address." });
    expect(parseJoinForm(form({ ...account, password: "short" }))).toEqual({
      success: false,
      message: "Use at least 8 characters.",
    });
  });

  it("asks for a real email address", () => {
    for (const email of ["meera", "meera@", "@example.test", "meera shah@example.test", "a@b", `${"x".repeat(250)}@example.test`]) {
      expect(parseJoinForm(form({ ...account, email }))).toEqual({ success: false, message: "Enter a valid email address." });
    }
  });

  it("keeps the other rules: a plan, the terms box, a long enough password, and the business's name for a paid plan", () => {
    const managed = { ...account, choice: "managed", businessName: " Smile Dental " };
    expect(parseJoinForm(form({ ...managed, choice: "" }))).toEqual({ success: false, message: "Choose a plan to continue." });
    expect(parseJoinForm(form({ ...managed, agree: "" }))).toEqual({ success: false, message: "Tick the box to agree to the Terms and Privacy Notice." });
    expect(parseJoinForm(form({ ...managed, password: "short" }))).toEqual({ success: false, message: "Use at least 8 characters." });
    expect(parseJoinForm(form({ ...managed, businessName: " " }))).toEqual({ success: false, message: "Tell us your business's name." });
  });
});

describe("readJoinChoice", () => {
  it("reads one of the two choices, and nothing else, including the retired plans", () => {
    expect(readJoinChoice("managed")).toBe("managed");
    expect(readJoinChoice("listing_only")).toBe("listing_only");
    expect(readJoinChoice("care")).toBeNull();
    expect(readJoinChoice("premium")).toBeNull();
    expect(readJoinChoice("own_website")).toBeNull();
    expect(readJoinChoice("Managed")).toBeNull();
    expect(readJoinChoice(undefined)).toBeNull();
    expect(readJoinChoice(["managed"])).toBeNull();
  });
});
