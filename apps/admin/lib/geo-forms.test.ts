import { describe, expect, it } from "vitest";
import {
  parseAreaAdd,
  parseAreaSave,
  parseCategoryAdd,
  parseCategorySave,
  parseDistrictAdd,
  parseDistrictSave,
} from "./geo-forms";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parseDistrictAdd", () => {
  it("makes the address from the name and starts off unless Soon is chosen", () => {
    expect(parseDistrictAdd(form({ name: "Mumbai City", state: "mh" }))).toEqual({
      ok: true,
      value: { stateCode: "mh", name: "Mumbai City", slug: "mumbai-city", status: "off" },
    });
    expect(parseDistrictAdd(form({ name: "Pune", state: "mh", status: "soon", slug: "pune-district" }))).toMatchObject({
      ok: true,
      value: { slug: "pune-district", status: "soon" },
    });
  });

  it("refuses a missing name, an unknown state and a reserved address", () => {
    expect(parseDistrictAdd(form({ name: " ", state: "mh" }))).toMatchObject({ ok: false });
    expect(parseDistrictAdd(form({ name: "Pune", state: "zz" }))).toEqual({ ok: false, message: "Choose the state." });
    expect(parseDistrictAdd(form({ name: "Business", state: "mh" }))).toMatchObject({ ok: false, message: expect.stringMatching(/already used/) });
  });
});

describe("parseDistrictSave", () => {
  it("carries the address only when the form does", () => {
    expect(parseDistrictSave(form({ id: "d1", name: "Thane", status: "live" }))).toEqual({
      ok: true,
      value: { id: "d1", name: "Thane", slug: null, status: "live" },
    });
    expect(parseDistrictSave(form({ id: "d1", name: "Thane", status: "soon", slug: "thane" }))).toMatchObject({ value: { slug: "thane" } });
  });

  it("refuses a status that is not one of the three", () => {
    expect(parseDistrictSave(form({ id: "d1", name: "Thane", status: "maybe" }))).toMatchObject({ ok: false });
  });
});

describe("parseAreaAdd", () => {
  const base = { district: "d1", name: "Kothrud Depot", town: "Pune", pins: "411038, 411029" };

  it("reads PINs, a point and the on switch", () => {
    expect(parseAreaAdd(form({ ...base, lat: "18.5", lon: "73.8", on: "on" }))).toEqual({
      ok: true,
      value: {
        districtId: "d1",
        slug: "kothrud-depot",
        name: "Kothrud Depot",
        cityName: "Pune",
        pincodes: ["411029", "411038"],
        lat: 18.5,
        lon: 73.8,
        on: true,
      },
    });
  });

  it("refuses bad PINs, a half point and a missing town", () => {
    expect(parseAreaAdd(form({ ...base, pins: "41103" }))).toEqual({ ok: false, message: "These are not PIN codes: 41103." });
    expect(parseAreaAdd(form({ ...base, lat: "18.5" }))).toMatchObject({ ok: false, message: expect.stringMatching(/both/) });
    expect(parseAreaAdd(form({ ...base, lat: "x", lon: "1" }))).toMatchObject({ ok: false, message: expect.stringMatching(/numbers/) });
    expect(parseAreaAdd(form({ ...base, town: "" }))).toMatchObject({ ok: false, message: expect.stringMatching(/^Town:/) });
  });
});

describe("parseAreaSave", () => {
  it("reads a switched-off area with no point", () => {
    expect(parseAreaSave(form({ id: "a1", name: "Vashi", town: "Navi Mumbai", pins: "", status: "off" }))).toEqual({
      ok: true,
      value: { id: "a1", name: "Vashi", cityName: "Navi Mumbai", pincodes: [], lat: null, lon: null, slug: null, status: "off" },
    });
  });
});

describe("parseCategoryAdd and parseCategorySave", () => {
  it("reads a sub-category with keywords", () => {
    expect(
      parseCategoryAdd(form({ label: "JEE Coaching", singular: "JEE Coaching", parent: "coaching-centers", keywords: "JEE, iit", page: "on" })),
    ).toEqual({
      ok: true,
      value: { label: "JEE Coaching", singular: "JEE Coaching", slug: "jee-coaching", parentSlug: "coaching-centers", keywords: ["jee", "iit"], hasPage: true, on: false },
    });
  });

  it("needs both names", () => {
    expect(parseCategorySave(form({ id: "c1", label: "Tailors", singular: "" }))).toMatchObject({ ok: false, message: expect.stringMatching(/^Single name:/) });
  });
});
