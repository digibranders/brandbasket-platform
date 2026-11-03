import { describe, expect, it } from "vitest";
import { z } from "zod";
import { actionFail, actionOk } from "./action-result";
import { formDataObject, INVALID_FORM_MESSAGE, parseForm } from "./form";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your business name."),
  services: z.array(z.string()).min(1, "Choose at least one service."),
});

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("formDataObject", () => {
  it("keeps a name sent once as its value and a repeated name as a list", () => {
    expect(formDataObject(form([["name", "Apex"], ["services", "social"], ["services", "search"]]))).toEqual({
      name: "Apex",
      services: ["social", "search"],
    });
  });
});

describe("parseForm", () => {
  it("returns the parsed data", () => {
    const data = form([["name", " Apex "], ["services", "a"], ["services", "b"]]);
    expect(parseForm(schema, data)).toEqual({ ok: true, data: { name: "Apex", services: ["a", "b"] } });
  });

  it("returns an ActionResult failure with the first message per field", () => {
    const result = parseForm(schema, form([["name", " "], ["services", "only"]]));
    expect(result).toEqual({
      ok: false,
      message: INVALID_FORM_MESSAGE,
      fieldErrors: { name: "Enter your business name.", services: "Invalid input: expected array, received string" },
    });
  });

  it("files an error on the whole object under form", () => {
    const refined = z.object({ a: z.string(), b: z.string() }).refine((v) => v.a === v.b, "The two entries must match.");
    const result = parseForm(refined, form([["a", "1"], ["b", "2"]]), "Fix the form.");
    expect(result).toEqual({ ok: false, message: "Fix the form.", fieldErrors: { form: "The two entries must match." } });
  });
});

describe("ActionResult helpers", () => {
  it("builds success with and without data", () => {
    expect(actionOk()).toEqual({ ok: true });
    expect(actionOk({ id: "r1" })).toEqual({ ok: true, data: { id: "r1" } });
  });

  it("builds a failure with optional field errors", () => {
    expect(actionFail("We could not save this.")).toEqual({ ok: false, message: "We could not save this." });
    expect(actionFail("Check.", { name: "Required." })).toEqual({ ok: false, message: "Check.", fieldErrors: { name: "Required." } });
  });
});
