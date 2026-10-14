import { describe, expect, it } from "vitest";
import { MAX_DESCRIPTION_LENGTH, parseBrandForm, photoDescriptionField } from "./brand-form";

const FIRST = "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d01";
const SECOND = "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d02";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseBrandForm", () => {
  it("needs at least one image", () => {
    expect(parseBrandForm(form({}), { photoIds: [], logoCount: 0 })).toEqual({
      success: false,
      message: "Add your logo or at least one photo.",
      field: null,
    });
  });

  it("completes with only a logo", () => {
    expect(parseBrandForm(form({}), { photoIds: [], logoCount: 1 })).toEqual({
      success: true,
      data: { descriptions: [] },
    });
  });

  it("collects a cleaned description for every saved photo, in the saved order", () => {
    const result = parseBrandForm(
      form({
        [photoDescriptionField(SECOND)]: "  The team outside the shop  ",
        [photoDescriptionField(FIRST)]: "Our front desk\nat opening",
      }),
      { photoIds: [FIRST, SECOND], logoCount: 0 },
    );
    expect(result).toEqual({
      success: true,
      data: {
        descriptions: [
          { mediaId: FIRST, altText: "Our front desk at opening" },
          { mediaId: SECOND, altText: "The team outside the shop" },
        ],
      },
    });
  });

  it("points at the first photo without a description", () => {
    expect(
      parseBrandForm(form({ [photoDescriptionField(FIRST)]: "Front desk", [photoDescriptionField(SECOND)]: "  " }), {
        photoIds: [FIRST, SECOND],
        logoCount: 1,
      }),
    ).toEqual({
      success: false,
      message: "Describe this photo for people who can't see it.",
      field: photoDescriptionField(SECOND),
    });
  });

  it("treats a missing field as an empty description", () => {
    expect(parseBrandForm(form({}), { photoIds: [FIRST], logoCount: 0 })).toMatchObject({
      success: false,
      field: photoDescriptionField(FIRST),
    });
  });

  it("refuses a description that is too long", () => {
    expect(
      parseBrandForm(form({ [photoDescriptionField(FIRST)]: "x".repeat(MAX_DESCRIPTION_LENGTH + 1) }), {
        photoIds: [FIRST],
        logoCount: 0,
      }),
    ).toMatchObject({ success: false, field: photoDescriptionField(FIRST) });
  });

  it("ignores descriptions for images the business does not have", () => {
    const result = parseBrandForm(
      form({ [photoDescriptionField(FIRST)]: "Front desk", [photoDescriptionField(SECOND)]: "Someone else's photo" }),
      { photoIds: [FIRST], logoCount: 0 },
    );
    expect(result).toEqual({ success: true, data: { descriptions: [{ mediaId: FIRST, altText: "Front desk" }] } });
  });
});
