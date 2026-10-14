import { describe, expect, it, vi } from "vitest";
import { PHONE_COUNTRY_FIELD } from "../phone/fields";
import { CHOOSE_COUNTRY_MESSAGE, INTERNATIONAL_PHONE_MESSAGE, PHONE_TOO_LONG_MESSAGE } from "../validation/phone";

// patient-form.ts imports validation/phone.ts, which is marked "server-only" and throws under plain Node; stub it the
// same way phone.test.ts does, and import the module under test afterwards so the mock is in place first.
vi.mock("server-only", () => ({}));

const {
  BOOKING_PHONE_MISSING_MESSAGE,
  CHOOSE_DAY_MESSAGE,
  CHOOSE_DOCTOR_MESSAGE,
  CHOOSE_SERVICE_MESSAGE,
  CHOOSE_TIME_MESSAGE,
  MERGE_PHONE_MISSING_MESSAGE,
  MERGE_SAME_PATIENT_MESSAGE,
  PATIENT_NAME_MISSING_MESSAGE,
  PATIENT_NAME_TOO_LONG_MESSAGE,
  PATIENT_NOT_FOUND_MESSAGE,
  TOO_MANY_TAGS_MESSAGE,
  parseErasePatient,
  parseManualBooking,
  parseMergeConfirm,
  parseMergeLookup,
  parsePatientEdit,
  parsePatientSearch,
  searchDigits,
  tagTooLongMessage,
} = await import("./patient-form");

const PATIENT_ID = "0192a4c8-7b1e-7c3d-9e2f-1a2b3c4d5e6f";
const OTHER_ID = "0192a4c8-7b1e-7c3d-9e2f-6f5e4d3c2b1a";
const DOCTOR_ID = "5b6a7c8d-1234-4a2b-9c3d-4e5f6a7b8c9d";
const SERVICE_ID = "7d8e9f0a-5678-4b3c-8d4e-5f6a7b8c9d0e";

function form(fields: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const NOT_FOUND = { success: false, field: null, message: PATIENT_NOT_FOUND_MESSAGE };

function refusal(field: string | null, message: string): { success: false; field: string | null; message: string } {
  return { success: false, field, message };
}

describe("parsePatientEdit", () => {
  const valid = { patientId: PATIENT_ID, name: " Priya\nSharma ", altPhone: "", altPhoneCountry: "IN", tags: "" };

  it("cleans the name and reads a blank second phone and no tags", () => {
    expect(parsePatientEdit(form(valid))).toEqual({
      success: true,
      data: { patientId: PATIENT_ID, name: "Priya Sharma", altPhone: null, tags: [] },
    });
  });

  it("reads a national second phone against its country", () => {
    const result = parsePatientEdit(form({ ...valid, altPhone: "98765 43210", altPhoneCountry: "IN" }));
    expect(result).toMatchObject({ success: true, data: { altPhone: "+919876543210" } });
  });

  it("reads an international second phone without a country", () => {
    const result = parsePatientEdit(form({ ...valid, altPhone: "+44 20 7946 0958", altPhoneCountry: "" }));
    expect(result).toMatchObject({ success: true, data: { altPhone: "+442079460958" } });
  });

  it("cleans, collapses and dedupes tags case-insensitively, keeping the first spelling", () => {
    const result = parsePatientEdit(form({ ...valid, tags: " VIP , needs   wheelchair,, vip,Needs Wheelchair ,  " }));
    expect(result).toMatchObject({ success: true, data: { tags: ["VIP", "needs wheelchair"] } });
  });

  it("accepts exactly 5 tags, each exactly 24 characters", () => {
    const tag = (letter: string): string => letter.repeat(24);
    const tags = ["a", "b", "c", "d", "e"].map(tag);
    expect(parsePatientEdit(form({ ...valid, tags: tags.join(",") }))).toMatchObject({ success: true, data: { tags } });
  });

  it("does not count repeats toward the limit of 5", () => {
    const result = parsePatientEdit(form({ ...valid, tags: "a,b,c,d,e,A,B" }));
    expect(result).toMatchObject({ success: true, data: { tags: ["a", "b", "c", "d", "e"] } });
  });

  it("treats a malformed patient id as not found", () => {
    expect(parsePatientEdit(form({ ...valid, patientId: "not-a-uuid" }))).toEqual(NOT_FOUND);
    expect(parsePatientEdit(form({ ...valid, patientId: "" }))).toEqual(NOT_FOUND);
  });

  it("asks for a name when it is blank", () => {
    expect(parsePatientEdit(form({ ...valid, name: "  \n " }))).toEqual(refusal("name", PATIENT_NAME_MISSING_MESSAGE));
  });

  it("refuses a name over 80 characters", () => {
    expect(parsePatientEdit(form({ ...valid, name: "a".repeat(81) }))).toEqual(
      refusal("name", PATIENT_NAME_TOO_LONG_MESSAGE),
    );
    expect(PATIENT_NAME_TOO_LONG_MESSAGE).toBe("Keep the name to 80 characters.");
  });

  it("refuses an invalid second phone on the number input", () => {
    const result = parsePatientEdit(form({ ...valid, altPhone: "+12", altPhoneCountry: "IN" }));
    expect(result).toEqual(refusal("altPhone", INTERNATIONAL_PHONE_MESSAGE));
  });

  it("refuses a national second phone for a country it does not fit", () => {
    const result = parsePatientEdit(form({ ...valid, altPhone: "12345", altPhoneCountry: "IN" }));
    expect(result).toEqual(refusal("altPhone", "Enter a valid phone number for India."));
  });

  it("refuses an over-long second phone", () => {
    const result = parsePatientEdit(form({ ...valid, altPhone: "9".repeat(41), altPhoneCountry: "IN" }));
    expect(result).toEqual(refusal("altPhone", PHONE_TOO_LONG_MESSAGE));
  });

  it("asks for the second phone's country when a national number has none", () => {
    const result = parsePatientEdit(form({ ...valid, altPhone: "98765 43210", altPhoneCountry: "" }));
    expect(result).toEqual(refusal("altPhoneCountry", CHOOSE_COUNTRY_MESSAGE));
  });

  it("refuses more than 5 distinct tags", () => {
    expect(parsePatientEdit(form({ ...valid, tags: "a,b,c,d,e,f" }))).toEqual(refusal("tags", TOO_MANY_TAGS_MESSAGE));
    expect(TOO_MANY_TAGS_MESSAGE).toBe("Up to 5 tags.");
  });

  it("refuses a tag over 24 characters and names it", () => {
    const long = "Prefers morning appointments";
    expect(parsePatientEdit(form({ ...valid, tags: `VIP, ${long}` }))).toEqual(
      refusal("tags", tagTooLongMessage(long)),
    );
    expect(tagTooLongMessage(long)).toBe('"Prefers morning appointm…" is too long. Keep tags to 24 characters.');
  });

  it("checks the tag count before tag lengths", () => {
    const result = parsePatientEdit(form({ ...valid, tags: `a,b,c,d,e,${"x".repeat(30)}` }));
    expect(result).toEqual(refusal("tags", TOO_MANY_TAGS_MESSAGE));
  });
});

describe("parsePatientSearch", () => {
  it("is empty when absent or blank", () => {
    expect(parsePatientSearch(undefined)).toBe("");
    expect(parsePatientSearch("   ")).toBe("");
  });

  it("trims and keeps a search to one line", () => {
    expect(parsePatientSearch("  Priya\nSharma ")).toBe("Priya Sharma");
  });

  it("cuts a long search to 80 characters", () => {
    expect(parsePatientSearch("a".repeat(200))).toBe("a".repeat(80));
  });

  it("does not leave half an emoji at the cut", () => {
    const cut = parsePatientSearch(`${"a".repeat(79)}😀`);
    expect(cut).toBe("a".repeat(79));
  });
});

describe("searchDigits", () => {
  it("returns the digits of a phone-like search", () => {
    expect(searchDigits("+91 98765-43210")).toBe("919876543210");
    expect(searchDigits("432")).toBe("432");
  });

  it("is null with fewer than 3 digits", () => {
    expect(searchDigits("Ravi 2")).toBeNull();
    expect(searchDigits("Priya")).toBeNull();
    expect(searchDigits("")).toBeNull();
  });
});

describe("parseMergeLookup", () => {
  const valid = { keepId: PATIENT_ID, phone: "98765 43210", [PHONE_COUNTRY_FIELD]: "IN" };

  it("reads the keep id and the other record's phone", () => {
    expect(parseMergeLookup(form(valid))).toEqual({
      success: true,
      data: { keepId: PATIENT_ID, phone: "+919876543210" },
    });
  });

  it("treats a malformed keep id as not found", () => {
    expect(parseMergeLookup(form({ ...valid, keepId: "123" }))).toEqual(NOT_FOUND);
  });

  it("asks for the phone when it is blank", () => {
    expect(parseMergeLookup(form({ ...valid, phone: " " }))).toEqual(refusal("phone", MERGE_PHONE_MISSING_MESSAGE));
  });

  it("refuses an invalid phone", () => {
    expect(parseMergeLookup(form({ ...valid, phone: "12345" }))).toEqual(
      refusal("phone", "Enter a valid phone number for India."),
    );
  });

  it("asks for the country when a national number has none", () => {
    expect(parseMergeLookup(form({ ...valid, [PHONE_COUNTRY_FIELD]: "" }))).toEqual(
      refusal(PHONE_COUNTRY_FIELD, CHOOSE_COUNTRY_MESSAGE),
    );
  });
});

describe("parseMergeConfirm", () => {
  it("reads both ids", () => {
    expect(parseMergeConfirm(form({ keepId: PATIENT_ID, removeId: OTHER_ID }))).toEqual({
      success: true,
      data: { keepId: PATIENT_ID, removeId: OTHER_ID },
    });
  });

  it("treats a malformed or missing id as not found", () => {
    expect(parseMergeConfirm(form({ keepId: "x", removeId: OTHER_ID }))).toEqual(NOT_FOUND);
    expect(parseMergeConfirm(form({ keepId: PATIENT_ID }))).toEqual(NOT_FOUND);
  });

  it("refuses merging a record into itself, whatever the letter case", () => {
    expect(parseMergeConfirm(form({ keepId: PATIENT_ID, removeId: PATIENT_ID.toUpperCase() }))).toEqual(
      refusal(null, MERGE_SAME_PATIENT_MESSAGE),
    );
  });
});

describe("parseErasePatient", () => {
  it("reads the patient id", () => {
    expect(parseErasePatient(form({ patientId: PATIENT_ID }))).toEqual({
      success: true,
      data: { patientId: PATIENT_ID },
    });
  });

  it("treats a malformed id as not found", () => {
    expect(parseErasePatient(form({ patientId: "nope" }))).toEqual(NOT_FOUND);
    expect(parseErasePatient(new FormData())).toEqual(NOT_FOUND);
  });
});

describe("parseManualBooking", () => {
  const walkIn = {
    date: "2026-10-05",
    start: "09:30",
    doctor: "any",
    serviceId: "",
    patientId: "",
    name: " Ravi Kumar ",
    phone: "98765 43210",
    [PHONE_COUNTRY_FIELD]: "IN",
  };

  it("reads a new patient with any doctor and no service", () => {
    expect(parseManualBooking(form(walkIn))).toEqual({
      success: true,
      data: {
        date: "2026-10-05",
        start: "09:30",
        practitionerId: null,
        serviceId: null,
        patient: { kind: "new", name: "Ravi Kumar", phone: "+919876543210" },
      },
    });
  });

  it("reads a chosen doctor and service", () => {
    const result = parseManualBooking(form({ ...walkIn, doctor: DOCTOR_ID, serviceId: SERVICE_ID }));
    expect(result).toMatchObject({ success: true, data: { practitionerId: DOCTOR_ID, serviceId: SERVICE_ID } });
  });

  it("reads an existing patient and ignores name and phone", () => {
    const result = parseManualBooking(form({ ...walkIn, patientId: PATIENT_ID, name: "", phone: "" }));
    expect(result).toMatchObject({ success: true, data: { patient: { kind: "existing", patientId: PATIENT_ID } } });
  });

  it("reads an existing patient when name and phone are not posted at all", () => {
    const result = parseManualBooking(
      form({ date: "2026-10-05", start: "09:30", doctor: "any", serviceId: "", patientId: PATIENT_ID }),
    );
    expect(result).toMatchObject({ success: true, data: { patient: { kind: "existing", patientId: PATIENT_ID } } });
  });

  it("asks for a day when the date is missing, malformed or not a real date", () => {
    for (const date of ["", "05/10/2026", "2026-02-30"]) {
      expect(parseManualBooking(form({ ...walkIn, date }))).toEqual(refusal("date", CHOOSE_DAY_MESSAGE));
    }
  });

  it("asks for a time when the start is missing or malformed", () => {
    for (const start of ["", "9:30", "24:00", "09:60"]) {
      expect(parseManualBooking(form({ ...walkIn, start }))).toEqual(refusal("start", CHOOSE_TIME_MESSAGE));
    }
  });

  it("refuses a doctor that is neither any nor an id", () => {
    for (const doctor of ["", "Dr Meera", "ANY"]) {
      expect(parseManualBooking(form({ ...walkIn, doctor }))).toEqual(refusal("doctor", CHOOSE_DOCTOR_MESSAGE));
    }
  });

  it("refuses a malformed service id", () => {
    expect(parseManualBooking(form({ ...walkIn, serviceId: "cleaning" }))).toEqual(
      refusal("serviceId", CHOOSE_SERVICE_MESSAGE),
    );
  });

  it("treats a malformed patient id as not found", () => {
    expect(parseManualBooking(form({ ...walkIn, patientId: "abc" }))).toEqual(NOT_FOUND);
  });

  it("asks for a new patient's name", () => {
    expect(parseManualBooking(form({ ...walkIn, name: " " }))).toEqual(refusal("name", PATIENT_NAME_MISSING_MESSAGE));
  });

  it("refuses a new patient's name over 80 characters", () => {
    expect(parseManualBooking(form({ ...walkIn, name: "b".repeat(81) }))).toEqual(
      refusal("name", PATIENT_NAME_TOO_LONG_MESSAGE),
    );
  });

  it("asks for a new patient's phone", () => {
    expect(parseManualBooking(form({ ...walkIn, phone: "" }))).toEqual(refusal("phone", BOOKING_PHONE_MISSING_MESSAGE));
  });

  it("refuses an invalid phone", () => {
    expect(parseManualBooking(form({ ...walkIn, phone: "+12" }))).toEqual(refusal("phone", INTERNATIONAL_PHONE_MESSAGE));
  });

  it("asks for the country when a national number has none", () => {
    expect(parseManualBooking(form({ ...walkIn, [PHONE_COUNTRY_FIELD]: "" }))).toEqual(
      refusal(PHONE_COUNTRY_FIELD, CHOOSE_COUNTRY_MESSAGE),
    );
  });
});
