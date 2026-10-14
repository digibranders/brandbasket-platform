import { describe, expect, it } from "vitest";
import { extraCategoryOptions, parseExtraCategoriesForm } from "./extra-categories-form";
import { OWNER_FORM_FIELDS_MESSAGE } from "./owner-form";

function form(categories: readonly string[], extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const slug of categories) data.append("category", slug);
  for (const [key, value] of Object.entries(extra)) data.append(key, value);
  return data;
}

describe("extraCategoryOptions", () => {
  it("lists every category A to Z except the main one", () => {
    const options = extraCategoryOptions("dentists");
    expect(options.some((option) => option.value === "dentists")).toBe(false);
    expect(options.some((option) => option.value === "cafes")).toBe(true);
    const labels = options.map((option) => option.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });
});

describe("parseExtraCategoriesForm", () => {
  it("takes up to three categories of the directory, in the order given", () => {
    expect(parseExtraCategoriesForm(form(["cafes", "bakeries", "dentists"]))).toEqual({
      success: true,
      data: ["cafes", "bakeries", "dentists"],
    });
  });

  it("takes none: the business lists in its main category only", () => {
    expect(parseExtraCategoriesForm(form([]))).toEqual({ success: true, data: [] });
  });

  it("keeps a repeated category once", () => {
    expect(parseExtraCategoriesForm(form(["cafes", "cafes"]))).toEqual({ success: true, data: ["cafes"] });
  });

  it("refuses a fourth category", () => {
    expect(parseExtraCategoriesForm(form(["cafes", "bakeries", "dentists", "plumbers"]))).toMatchObject({
      success: false,
      message: "List in at most 3 extra categories.",
    });
  });

  it("refuses a category the directory does not have", () => {
    expect(parseExtraCategoriesForm(form(["cafes", "nope"]))).toMatchObject({ success: false, message: "Choose categories from the list." });
  });

  it("refuses a form that sends a field it does not show", () => {
    expect(parseExtraCategoriesForm(form(["cafes"], { slug: "x" }))).toEqual({ success: false, message: OWNER_FORM_FIELDS_MESSAGE });
  });
});
