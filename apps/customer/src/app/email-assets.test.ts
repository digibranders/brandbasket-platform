import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emailLogoUrl } from "@brandbasket/email";
import { describe, expect, it } from "vitest";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public");

describe("files that customer emails link to on the app host", () => {
  it("serves the email logo from this app's public folder (nginx sends every path but the platform's to this app)", () => {
    const { pathname, host } = new URL(emailLogoUrl());
    expect(host).toBe("app.brandbasket.in");
    expect(existsSync(join(PUBLIC_DIR, pathname))).toBe(true);
  });
});
