import { describe, expect, it } from "vitest";
import { OWNER_FORM_FIELDS_MESSAGE } from "./owner-form";
import { parseFaqForm, parsePriceInr, parseProductForm, parseServiceForm, readItemId } from "./catalog-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const ID = "0192f3a4-7b2c-7c3e-9a1d-5e6f7a8b9c0d";
const service = { id: "", name: "  Teeth  scaling ", summary: "", description: "", price: "₹ 1,500", duration: "45", area: "" };

describe("parsePriceInr", () => {
  it("reads whole rupees however they are typed, and blank as on request", () => {
    expect(parsePriceInr("1500")).toEqual({ ok: true, value: 1500 });
    expect(parsePriceInr("₹ 1,500")).toEqual({ ok: true, value: 1500 });
    expect(parsePriceInr("Rs. 20")).toEqual({ ok: true, value: 20 });
    expect(parsePriceInr("  ")).toEqual({ ok: true, value: null });
    expect(parsePriceInr("0")).toEqual({ ok: true, value: 0 });
  });

  it("refuses decimals, words and prices past the limit", () => {
    for (const typed of ["12.5", "free", "-5", "10000001"]) expect(parsePriceInr(typed).ok).toBe(false);
  });
});

describe("parseServiceForm", () => {
  it("returns a new service cleaned up", () => {
    expect(parseServiceForm(form(service))).toEqual({
      success: true,
      id: null,
      data: { category: "Services", name: "Teeth scaling", summary: null, description: null, priceInr: 1500, durationMinutes: 45, serviceArea: null },
    });
  });

  it("carries the id of a service being edited", () => {
    expect(parseServiceForm(form({ ...service, id: ID, area: "Thane", description: "Ultrasonic." }))).toMatchObject({
      success: true,
      id: ID,
      data: { serviceArea: "Thane", description: "Ultrasonic." },
    });
  });

  it("names the box that is wrong", () => {
    expect(parseServiceForm(form({ ...service, name: "" }))).toMatchObject({ success: false, field: "name" });
    expect(parseServiceForm(form({ ...service, price: "lots" }))).toMatchObject({ success: false, field: "price" });
    expect(parseServiceForm(form({ ...service, duration: "0" }))).toMatchObject({ success: false, field: "duration" });
    expect(parseServiceForm(form({ ...service, duration: "1441" }))).toMatchObject({ success: false, field: "duration" });
    expect(parseServiceForm(form({ ...service, description: "x".repeat(2001) }))).toMatchObject({ success: false, field: "description" });
    expect(parseServiceForm(form({ ...service, summary: "x".repeat(121) }))).toMatchObject({ success: false, field: "summary" });
  });

  it("keeps the one line short and the long description long", () => {
    expect(parseServiceForm(form({ ...service, summary: "  Removes   plaque ", description: "x".repeat(2000) }))).toMatchObject({
      success: true,
      data: { summary: "Removes plaque", description: "x".repeat(2000) },
    });
  });

  it("files every service under one group, since services are not grouped", () => {
    expect(parseServiceForm(form(service))).toMatchObject({ data: { category: "Services" } });
  });

  it("refuses an id that is not one and a field the form does not show, a group included", () => {
    expect(parseServiceForm(form({ ...service, category: "Cleaning" }))).toEqual({ success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE });
    expect(parseServiceForm(form({ ...service, id: "not-a-uuid" }))).toEqual({ success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE });
    expect(parseServiceForm(form({ ...service, businessId: ID }))).toEqual({ success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE });
  });
});

describe("parseProductForm", () => {
  const product = { id: "", name: "Electric toothbrush", description: "", price: "2,499", category: "", availability: "in_stock" };

  it("returns a product with its availability", () => {
    expect(parseProductForm(form(product))).toEqual({
      success: true,
      id: null,
      data: { name: "Electric toothbrush", description: null, priceInr: 2499, category: null, availability: "in_stock" },
    });
  });

  it("refuses an unknown availability", () => {
    expect(parseProductForm(form({ ...product, availability: "maybe" }))).toMatchObject({ success: false, field: "availability" });
  });
});

describe("parseFaqForm", () => {
  const faq = { id: "", question: "  Do you take   walk-ins? ", answer: "  Yes.\r\nNo booking needed.  " };

  it("returns a new question and answer cleaned up, keeping the answer's line breaks", () => {
    expect(parseFaqForm(form(faq))).toEqual({ success: true, id: null, data: { question: "Do you take walk-ins?", answer: "Yes.\nNo booking needed." } });
  });

  it("carries the id of a question being edited", () => {
    expect(parseFaqForm(form({ ...faq, id: ID }))).toMatchObject({ success: true, id: ID });
  });

  it("names the field that is wrong", () => {
    expect(parseFaqForm(form({ ...faq, question: " " }))).toMatchObject({ success: false, field: "question" });
    expect(parseFaqForm(form({ ...faq, question: "q".repeat(151) }))).toMatchObject({ success: false, field: "question" });
    expect(parseFaqForm(form({ ...faq, answer: "  " }))).toMatchObject({ success: false, field: "answer" });
    expect(parseFaqForm(form({ ...faq, answer: "a".repeat(601) }))).toMatchObject({ success: false, field: "answer" });
  });

  it("refuses a form with a field it does not know, or a bad id", () => {
    expect(parseFaqForm(form({ ...faq, id: "not-a-uuid" }))).toEqual({ success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE });
    expect(parseFaqForm(form({ ...faq, businessId: ID }))).toEqual({ success: false, field: null, message: OWNER_FORM_FIELDS_MESSAGE });
  });
});

describe("readItemId", () => {
  it("returns a well-formed id and nothing else", () => {
    expect(readItemId(form({ id: ID }))).toBe(ID);
    expect(readItemId(form({ id: "1; drop table" }))).toBeNull();
    expect(readItemId(form({}))).toBeNull();
  });
});
