import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MaskedPhone } from "@/components/masked-phone";
import { leadContactLine } from "./mask";

vi.mock("server-only", () => ({}));

describe("leadContactLine", () => {
  it("puts the lead's name beside their number with all but its last three digits hidden", () => {
    expect(leadContactLine("Asha Rao", "+919820011223", "asha@example.test")).toBe("Asha Rao · +91 ••••••• 223");
  });

  it("shows their email address beside the name for a lead who gave no number", () => {
    expect(leadContactLine("Asha Rao", null, "asha@example.test")).toBe("Asha Rao · asha@example.test");
  });

  it("hides a number it cannot read entirely", () => {
    expect(leadContactLine("Asha Rao", "not a number", "asha@example.test")).toBe("Asha Rao · ••••••••••");
  });
});

describe("MaskedPhone", () => {
  it("shows the number hidden, with no call link, so a list gives away no way to ring the person", () => {
    const html = renderToStaticMarkup(createElement(MaskedPhone, { phone: "+919820011223" }));
    expect(html).toContain("+91 ••••••• 223");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("9820011223");
  });
});
