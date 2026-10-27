import { passwordPolicyProblem } from "@brandbasket/auth/password-policy";

export type StaffAcceptField = "name" | "password" | "confirm";

export type StaffAcceptParse =
  | { readonly ok: true; readonly name: string; readonly password: string }
  | { readonly ok: false; readonly field: StaffAcceptField; readonly message: string };

const NAME_MAX = 120;

/** The new account's name and password, checked against the same rule as every other new password. */
export function parseStaffAcceptForm(formData: FormData): StaffAcceptParse {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (name === "") return { ok: false, field: "name", message: "Enter your name." };
  if (name.length > NAME_MAX) return { ok: false, field: "name", message: `Use ${NAME_MAX} characters or fewer.` };
  const password = formData.get("password");
  const confirm = formData.get("confirm");
  if (typeof password !== "string") return { ok: false, field: "password", message: "Choose a password." };
  const problem = passwordPolicyProblem(password);
  if (problem !== null) return { ok: false, field: "password", message: problem };
  if (confirm !== password) return { ok: false, field: "confirm", message: "The two passwords don't match." };
  return { ok: true, name, password };
}
