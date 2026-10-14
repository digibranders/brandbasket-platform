import { describe, expect, it } from "vitest";
import { ownerFormCheck } from "./owner-form";

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("ownerFormCheck", () => {
  const check = ownerFormCheck(["businessName", "address"]);

  it("takes the form's own fields, any of them left out", () => {
    expect(check(form([["businessName", "Smile"], ["address", "12 Road"]]))).toBe(true);
    expect(check(form([["businessName", "Smile"]]))).toBe(true);
  });

  it("refuses a field the form does not show", () => {
    expect(check(form([["businessName", "Smile"], ["urlSlug", "someone-else"]]))).toBe(false);
  });

  it("ignores the fields React adds for a server action sent from the browser", () => {
    expect(
      check(
        form([
          ["$ACTION_REF_1", ""],
          ["$ACTION_1:0", '{"id":"abc","bound":"$@1"}'],
          ["$ACTION_1:1", "[]"],
          ["$ACTION_KEY", "k123"],
          ["businessName", "Smile"],
        ]),
      ),
    ).toBe(true);
  });
});
