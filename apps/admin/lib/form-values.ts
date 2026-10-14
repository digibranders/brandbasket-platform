/** Field names React adds to a server action's form data; they are not answers. */
const FRAMEWORK_FIELD = /^\$ACTION/;

/** What was typed, by field name, so a refused save can put it all back and lose nothing. */
export function submittedValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string" || FRAMEWORK_FIELD.test(name)) continue;
    values[name] = value;
  }
  return values;
}
