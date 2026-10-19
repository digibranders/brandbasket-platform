import { describe, expect, it } from "vitest";
import { PATIENT_NOTICE_LANGUAGES, PATIENT_NOTICE_VERSION, patientNotice } from "./patient-notice";

describe("patientNotice", () => {
  it.each(PATIENT_NOTICE_LANGUAGES)("names the clinic and says what the details are for, in %s", (language) => {
    const text = patientNotice("Smile Dental", language);
    expect(text).toContain("Smile Dental");
    expect(text).not.toContain("{clinic}");
    expect(text.length).toBeGreaterThan(120);
  });

  it("says the code goes by email to the address given, and never mentions a text message or a mobile number", () => {
    const text = patientNotice("Smile Dental", "en");
    expect(text).toContain("We email a code to your email address");
    expect(text).not.toMatch(/\btext(s|ed)?\b|\bsms\b|mobile/i);
    expect(PATIENT_NOTICE_VERSION).toBe("patient-2026-10-14");
  });

  it("covers who holds the details and how to ask about them, in English", () => {
    const text = patientNotice("Smile Dental", "en");
    expect(text).toContain("confirm your appointment");
    expect(text).toContain("Brandbasket");
    expect(text).toContain("see, correct or delete");
  });

  it("names whoever runs the booking page: Brandbasket unless told, or the deployment's own brand, in every language", () => {
    for (const language of PATIENT_NOTICE_LANGUAGES) {
      expect(patientNotice("Smile Dental", language)).toContain("Brandbasket");
      const brandbasket = patientNotice("Smile Dental", language, "Brandbasket");
      expect(brandbasket).toContain("Brandbasket");
      expect(brandbasket).not.toMatch(/first\s?fold|\{operator\}|\{clinic\}/i);
    }
  });

  it("uses no dashes as punctuation", () => {
    for (const language of PATIENT_NOTICE_LANGUAGES) expect(patientNotice("Smile Dental", language)).not.toMatch(/[\u2013\u2014]/);
  });

  it("falls back to English for a language it does not have, and puts the clinic's name in whole", () => {
    expect(patientNotice("Dr. Rao & Sons", "xx" as never)).toBe(patientNotice("Dr. Rao & Sons", "en"));
    expect(patientNotice("Dr. $& Rao", "en")).toContain("Dr. $& Rao");
  });

  it("has a version label that fits a consent record", () => {
    expect(PATIENT_NOTICE_VERSION.length).toBeGreaterThan(0);
    expect(PATIENT_NOTICE_VERSION.length).toBeLessThanOrEqual(40);
  });
});
