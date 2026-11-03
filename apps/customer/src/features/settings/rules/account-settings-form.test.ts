import { describe, expect, it } from "vitest";
import { parseForm } from "@/lib/form";
import { changePasswordSchema, deleteAccountSchema, exitDetailsSchema, profileSchema } from "./account-settings-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

/** The first message of each field a refused form names. */
function fieldErrors(result: ReturnType<typeof parseForm>): Record<string, string> {
  if (result.ok) throw new Error("expected the form to be refused");
  return { ...result.fieldErrors };
}

describe("changePasswordSchema", () => {
  const valid = { currentPassword: "old-password-1", newPassword: "a-new-password-2!", confirmPassword: "a-new-password-2!" };

  it("accepts the current password and a new one typed twice", () => {
    expect(parseForm(changePasswordSchema, form(valid))).toEqual({ ok: true, data: valid });
  });

  it("asks for the current password", () => {
    expect(fieldErrors(parseForm(changePasswordSchema, form({ ...valid, currentPassword: "" })))).toEqual({ currentPassword: "Enter your current password." });
    expect(fieldErrors(parseForm(changePasswordSchema, form({ newPassword: valid.newPassword, confirmPassword: valid.confirmPassword })))).toEqual({
      currentPassword: "Enter your current password.",
    });
  });

  it("holds the new password to the same rule as sign-up", () => {
    const short = fieldErrors(parseForm(changePasswordSchema, form({ ...valid, newPassword: "short", confirmPassword: "short" })));
    expect(short.newPassword).toBe("Use at least 8 characters.");
    const noSymbol = fieldErrors(parseForm(changePasswordSchema, form({ ...valid, newPassword: "abcdefgh1", confirmPassword: "abcdefgh1" })));
    expect(noSymbol.newPassword).toBe("Add at least one symbol, such as ! # or @.");
  });

  it("refuses new passwords that differ", () => {
    expect(fieldErrors(parseForm(changePasswordSchema, form({ ...valid, confirmPassword: "something-else-9!" })))).toEqual({
      confirmPassword: "Both new passwords must match.",
    });
  });

  it("refuses a new password equal to the current one", () => {
    const same = "old-password-1!";
    expect(fieldErrors(parseForm(changePasswordSchema, form({ currentPassword: same, newPassword: same, confirmPassword: same })))).toEqual({
      newPassword: "Choose a password you haven’t used here before.",
    });
  });

  it("refuses a password longer than the server takes", () => {
    const long = `${"a1!".repeat(43)}`;
    expect(fieldErrors(parseForm(changePasswordSchema, form({ ...valid, currentPassword: long }))).currentPassword).toBe("That password is too long.");
  });
});

describe("profileSchema", () => {
  it("trims the name", () => {
    expect(parseForm(profileSchema, form({ name: "  Anand Verma " }))).toEqual({ ok: true, data: { name: "Anand Verma" } });
  });

  it("needs a name and keeps it a sane length", () => {
    expect(fieldErrors(parseForm(profileSchema, form({ name: "   " })))).toEqual({ name: "Tell us your name." });
    expect(fieldErrors(parseForm(profileSchema, form({})))).toEqual({ name: "Tell us your name." });
    expect(fieldErrors(parseForm(profileSchema, form({ name: "n".repeat(121) })))).toEqual({ name: "That name is too long." });
    expect(parseForm(profileSchema, form({ name: "n".repeat(120) })).ok).toBe(true);
  });
});

describe("exitDetailsSchema", () => {
  it("takes a reason and trims the comment", () => {
    expect(parseForm(exitDetailsSchema, form({ reason: "too_expensive", comment: "  a bit much  " }))).toEqual({
      ok: true,
      data: { reason: "too_expensive", comment: "a bit much" },
    });
  });

  it("treats a blank comment as none", () => {
    expect(parseForm(exitDetailsSchema, form({ reason: "other", comment: "   " }))).toEqual({ ok: true, data: { reason: "other", comment: null } });
    expect(parseForm(exitDetailsSchema, form({ reason: "other" }))).toEqual({ ok: true, data: { reason: "other", comment: null } });
  });

  it("refuses a reason that is not one of ours", () => {
    expect(fieldErrors(parseForm(exitDetailsSchema, form({ reason: "because" })))).toEqual({ reason: "Choose the reason closest to yours." });
    expect(parseForm(exitDetailsSchema, form({})).ok).toBe(false);
  });

  it("refuses a comment past the limit", () => {
    expect(parseForm(exitDetailsSchema, form({ reason: "other", comment: "x".repeat(1001) })).ok).toBe(false);
    expect(parseForm(exitDetailsSchema, form({ reason: "other", comment: "x".repeat(1000) })).ok).toBe(true);
  });
});

describe("deleteAccountSchema", () => {
  const valid = { reason: "not_using", comment: "", confirmation: "DELETE", password: "my-password-123" };

  it("needs the reason, the word DELETE and the password", () => {
    expect(parseForm(deleteAccountSchema, form(valid))).toEqual({
      ok: true,
      data: { reason: "not_using", comment: null, confirmation: "DELETE", password: "my-password-123" },
    });
  });

  it("is strict about the word: capitals, nothing else", () => {
    expect(parseForm(deleteAccountSchema, form({ ...valid, confirmation: "delete" })).ok).toBe(false);
    expect(parseForm(deleteAccountSchema, form({ ...valid, confirmation: "DELETE ME" })).ok).toBe(false);
    expect(parseForm(deleteAccountSchema, form({ ...valid, confirmation: "  DELETE " })).ok).toBe(true);
    expect(fieldErrors(parseForm(deleteAccountSchema, form({ ...valid, confirmation: "delete" })))).toEqual({ confirmation: "Type DELETE in capitals to confirm." });
  });

  it("needs a password", () => {
    expect(fieldErrors(parseForm(deleteAccountSchema, form({ ...valid, password: "" })))).toEqual({ password: "Enter your password to confirm it’s you." });
  });

  it("refuses a missing reason", () => {
    expect(fieldErrors(parseForm(deleteAccountSchema, form({ ...valid, reason: "" })))).toEqual({ reason: "Choose the reason closest to yours." });
  });
});
