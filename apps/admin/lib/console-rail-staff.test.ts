import { describe, expect, it } from "vitest";
import { railFor } from "./console-rail";

const hrefs = (role: "support" | "finance" | "admin"): string[] => railFor(role).flatMap((section) => section.links.map((link) => link.href));

describe("the Staff rail entry", () => {
  it("shows for admins only, in System, before Settings", () => {
    expect(hrefs("support")).not.toContain("/staff");
    expect(hrefs("finance")).not.toContain("/staff");
    const system = railFor("admin").find((section) => section.label === "System");
    const links = system?.links.map((link) => link.href) ?? [];
    expect(links).toContain("/staff");
    expect(links.indexOf("/staff")).toBe(links.indexOf("/settings") - 1);
  });
});
