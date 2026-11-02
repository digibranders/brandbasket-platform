import { describe, expect, it } from "vitest";
import { MAX_FILE_NAME_LENGTH, parseUploadFileName } from "./file-name";

describe("parseUploadFileName", () => {
  it("decodes a percent-encoded name", () => {
    expect(parseUploadFileName(encodeURIComponent("Front desk – café.jpg"))).toBe("Front desk – café.jpg");
  });

  it("keeps only the last path segment, whichever separator was used", () => {
    expect(parseUploadFileName(encodeURIComponent("C:\\Users\\me\\front desk.jpg"))).toBe("front desk.jpg");
    expect(parseUploadFileName(encodeURIComponent("../../etc/passwd"))).toBe("passwd");
    expect(parseUploadFileName("..%2F..%2Fsecret.png")).toBe("secret.png");
  });

  it("removes control characters and direction overrides", () => {
    expect(parseUploadFileName(encodeURIComponent("pho\u0000to\r\n.jpg"))).toBe("photo.jpg");
    expect(parseUploadFileName(encodeURIComponent("invoice\u202Egpj.exe"))).toBe("invoicegpj.exe");
  });

  it("removes zero-width, joiner, direction-mark, separator and byte-order characters", () => {
    const invisible = [
      "\u200B",
      "\u200C",
      "\u200D",
      "\u200E",
      "\u200F",
      "\u061C",
      "\u2028",
      "\u2029",
      "\u2060",
      "\u2061",
      "\u2062",
      "\u2063",
      "\u2064",
      "\uFEFF",
      "\u2066",
      "\u2069",
      "\u202A",
    ];
    for (const character of invisible) {
      const label = `U+${character.codePointAt(0)?.toString(16).toUpperCase() ?? "?"}`;
      expect(parseUploadFileName(encodeURIComponent(`front${character}desk.jpg`)), label).toBe("frontdesk.jpg");
    }
    expect(parseUploadFileName(encodeURIComponent(invisible.join("")))).toBe("upload");
    expect(parseUploadFileName(encodeURIComponent("\uFEFF\u200Bphoto.jpg\u2060"))).toBe("photo.jpg");
  });

  it("keeps visible characters just outside the removed ranges", () => {
    // Hair space 200A, hyphen 2010 and the Arabic semicolon 061B are ordinary, visible text.
    const name = "a\u200Ab\u2010c\u061Bd.jpg";
    expect(parseUploadFileName(encodeURIComponent(name))).toBe(name);
  });

  it("caps the length without splitting a character", () => {
    expect(parseUploadFileName("a".repeat(300))).toHaveLength(MAX_FILE_NAME_LENGTH);
    const emoji = parseUploadFileName(encodeURIComponent("😀".repeat(200)));
    expect(Array.from(emoji)).toHaveLength(MAX_FILE_NAME_LENGTH);
    expect(emoji).toBe("😀".repeat(MAX_FILE_NAME_LENGTH));
  });

  it("falls back to 'upload' for a missing, blank or path-only name", () => {
    expect(parseUploadFileName(null)).toBe("upload");
    expect(parseUploadFileName("")).toBe("upload");
    expect(parseUploadFileName("%20%20")).toBe("upload");
    expect(parseUploadFileName(encodeURIComponent("folder/"))).toBe("upload");
  });

  it("keeps a name that is not valid percent-encoding as it arrived", () => {
    expect(parseUploadFileName("100%.jpg")).toBe("100%.jpg");
  });
});
