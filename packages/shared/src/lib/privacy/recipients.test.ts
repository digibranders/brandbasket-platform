import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DATA_RECIPIENTS } from "./recipients";

const PROCESSORS_FILE = fileURLToPath(new URL("../../../../../docs/operations/processors.md", import.meta.url));

describe("DATA_RECIPIENTS", () => {
  it("names only vendors that the processors register still lists", () => {
    const register = readFileSync(PROCESSORS_FILE, "utf8");
    for (const recipient of DATA_RECIPIENTS) expect(register, recipient.name).toContain(recipient.name);
  });

  it("lists each vendor once, and says what each does, what it receives and where", () => {
    expect(new Set(DATA_RECIPIENTS.map((recipient) => recipient.name)).size).toBe(DATA_RECIPIENTS.length);
    for (const recipient of DATA_RECIPIENTS) {
      expect(recipient.service.length).toBeGreaterThan(10);
      expect(recipient.receives.length).toBeGreaterThan(10);
      expect(recipient.location.length).toBeGreaterThan(3);
    }
  });
});
