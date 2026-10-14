import { describe, expect, it } from "vitest";
import { MAPS_LINK_MAX_LENGTH, parseMapsLink } from "./maps-link";

describe("parseMapsLink", () => {
  it("takes an empty box as no link", () => {
    expect(parseMapsLink("   ")).toEqual({ ok: true, url: null, pin: null });
  });

  it("keeps a place link and reads the place's own pin over the map's centre", () => {
    const link = "https://www.google.com/maps/place/Gentle+Dental/@19.1900,72.9700,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d19.1943!4d72.9706";
    expect(parseMapsLink(link)).toEqual({ ok: true, url: link, pin: { latitude: 19.1943, longitude: 72.9706 } });
  });

  it("reads the map's centre when the link has nothing better", () => {
    expect(parseMapsLink("https://www.google.com/maps/@19.2183,72.9781,15z")).toMatchObject({ pin: { latitude: 19.2183, longitude: 72.9781 } });
  });

  it("reads a query or destination given as coordinates", () => {
    expect(parseMapsLink("https://maps.google.com/?q=19.2,72.97")).toMatchObject({ pin: { latitude: 19.2, longitude: 72.97 } });
    expect(parseMapsLink("https://www.google.com/maps/dir/?api=1&destination=19.21%2C72.98")).toMatchObject({
      pin: { latitude: 19.21, longitude: 72.98 },
    });
  });

  it("keeps a short share link, which carries no pin", () => {
    expect(parseMapsLink("maps.app.goo.gl/AbC123xyz")).toEqual({ ok: true, url: "https://maps.app.goo.gl/AbC123xyz", pin: null });
    expect(parseMapsLink("https://goo.gl/maps/AbC123")).toEqual({ ok: true, url: "https://goo.gl/maps/AbC123", pin: null });
  });

  it("upgrades http and accepts Google's country sites", () => {
    expect(parseMapsLink("http://www.google.co.in/maps/place/X/@19.19,72.97,17z")).toMatchObject({
      ok: true,
      url: "https://www.google.co.in/maps/place/X/@19.19,72.97,17z",
    });
  });

  it("drops a pin outside India, keeping the link", () => {
    expect(parseMapsLink("https://www.google.com/maps/@51.5072,-0.1276,12z")).toMatchObject({ ok: true, pin: null });
  });

  it("refuses anything that is not a Google Maps link", () => {
    for (const typed of [
      "https://example.com/maps/@19.19,72.97",
      "https://www.google.com/search?q=dentist",
      "https://goo.gl/xyz",
      "javascript:alert(1)",
      "https://user@www.google.com/maps/@19.19,72.97",
      "not a link at all",
    ]) {
      expect(parseMapsLink(typed)).toMatchObject({ ok: false });
    }
  });

  it("refuses a link longer than the database keeps", () => {
    expect(parseMapsLink(`https://www.google.com/maps/place/${"a".repeat(MAPS_LINK_MAX_LENGTH)}`)).toMatchObject({ ok: false });
  });
});
