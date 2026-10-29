import { describe, expect, it } from "vitest";
import { ownedFirst } from "./order";

const CATALOGUE = [{ id: "managed-website" }, { id: "social-media-ads" }, { id: "local-seo-aeo" }] as const;
const entry = (addOn: string, kind: "included" | "available") => ({ addOn, kind }) as never;

describe("ownedFirst", () => {
  it("puts the services the customer has first and keeps the catalogue's order inside each group", () => {
    const entries = [entry("managed-website", "available"), entry("social-media-ads", "included"), entry("local-seo-aeo", "included")];
    expect(ownedFirst(CATALOGUE as never, entries).map((item) => (item as { addOn: string }).addOn)).toEqual(["social-media-ads", "local-seo-aeo", "managed-website"]);
  });

  it("leaves the catalogue's order alone when the customer has all of them, or none", () => {
    const all = CATALOGUE.map((item) => entry(item.id, "included"));
    const none = CATALOGUE.map((item) => entry(item.id, "available"));
    expect(ownedFirst(CATALOGUE as never, all).map((item) => (item as { addOn: string }).addOn)).toEqual(["managed-website", "social-media-ads", "local-seo-aeo"]);
    expect(ownedFirst(CATALOGUE as never, none).map((item) => (item as { addOn: string }).addOn)).toEqual(["managed-website", "social-media-ads", "local-seo-aeo"]);
  });

  it("skips an entry the catalogue does not list, and a catalogue item with no entry", () => {
    expect(ownedFirst(CATALOGUE as never, [entry("managed-website", "included"), entry("unknown", "included")]).map((item) => (item as { addOn: string }).addOn)).toEqual(["managed-website"]);
  });
});
