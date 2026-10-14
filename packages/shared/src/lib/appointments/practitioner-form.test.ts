import { describe, expect, it } from "vitest";
import { parsePractitionerFields, PRACTITIONER_NAME_MAX_LENGTH, PRACTITIONER_TITLE_MAX_LENGTH } from "./practitioner-form";

describe("parsePractitionerFields", () => {
  it("cleans the name and title", () => {
    expect(parsePractitionerFields({ name: "  Dr Meera Iyer ", title: " Physiotherapist\n" })).toEqual({
      success: true,
      data: { name: "Dr Meera Iyer", title: "Physiotherapist" },
    });
  });

  it("turns a blank title into null", () => {
    expect(parsePractitionerFields({ name: "Dr Meera Iyer", title: "   " })).toEqual({
      success: true,
      data: { name: "Dr Meera Iyer", title: null },
    });
  });

  it("joins a name typed across lines into one line", () => {
    expect(parsePractitionerFields({ name: "Dr Meera\nIyer", title: "" })).toEqual({
      success: true,
      data: { name: "Dr Meera Iyer", title: null },
    });
  });

  it("asks for a name when it is blank", () => {
    expect(parsePractitionerFields({ name: "  ", title: "Physiotherapist" })).toEqual({
      success: false,
      field: "name",
      message: "Enter the doctor's name.",
    });
  });

  it("accepts a name and a title right at the limit", () => {
    const name = "x".repeat(PRACTITIONER_NAME_MAX_LENGTH);
    const title = "y".repeat(PRACTITIONER_TITLE_MAX_LENGTH);
    expect(parsePractitionerFields({ name, title })).toEqual({ success: true, data: { name, title } });
  });

  it("rejects a name over the limit", () => {
    expect(parsePractitionerFields({ name: "x".repeat(81), title: "" })).toEqual({
      success: false,
      field: "name",
      message: "Keep the name to 80 characters.",
    });
  });

  it("rejects a title over the limit", () => {
    expect(parsePractitionerFields({ name: "Dr Meera Iyer", title: "y".repeat(81) })).toEqual({
      success: false,
      field: "title",
      message: "Keep the title to 80 characters.",
    });
  });

  it("checks the name before the title", () => {
    const result = parsePractitionerFields({ name: "", title: "y".repeat(81) });
    expect(result.success === false && result.field).toBe("name");
  });
});
