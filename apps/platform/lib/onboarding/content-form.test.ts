import { describe, expect, it } from "vitest";
import { MAX_SERVICES, parseContentForm } from "./content-form";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("parseContentForm", () => {
  it("reads the services in row order, whatever order the fields arrive in", () => {
    const result = parseContentForm(
      form({
        "services.4.name": "Whitening",
        "services.0.name": " Check-up ",
        "services.0.summary": "Twice a year.",
        "services.0.price": "From $40",
      }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        services: [
          { name: "Check-up", summary: "Twice a year.", priceText: "From $40" },
          { name: "Whitening", summary: null, priceText: null },
        ],
        notesForBuilder: null,
        styleLikes: null,
        referenceUrls: [],
      },
    });
  });

  it("skips rows left completely blank", () => {
    const result = parseContentForm(form({ "services.0.name": "Check-up", "services.1.name": " ", "services.1.price": "" }));
    expect(result).toMatchObject({ success: true, data: { services: [{ name: "Check-up" }] } });
  });

  it("requires at least one service", () => {
    expect(parseContentForm(form({ "services.0.name": "" }))).toMatchObject({
      success: false,
      message: "Add at least one service.",
      field: "services.0.name",
    });
  });

  it("points at the row the browser used, not its position in the cleaned list", () => {
    const result = parseContentForm(
      form({ "services.0.name": "Check-up", "services.1.name": "", "services.7.summary": "No name given" }),
    );
    expect(result).toMatchObject({ success: false, field: "services.7.name", message: "Give this service a name." });
  });

  it("maps a too-long price note back to its price field", () => {
    expect(parseContentForm(form({ "services.3.name": "Braces", "services.3.price": "x".repeat(61) }))).toMatchObject({
      field: "services.3.price",
    });
  });

  it(`caps the list at ${MAX_SERVICES} services`, () => {
    const entries: Record<string, string> = {};
    for (let index = 0; index <= MAX_SERVICES; index += 1) entries[`services.${index}.name`] = `Service ${index}`;
    expect(parseContentForm(form(entries))).toMatchObject({ success: false });
  });

  it("ignores field names it doesn't recognise", () => {
    const result = parseContentForm(
      form({ "services.0.name": "Check-up", "services.0.owner": "x", "services.999999.name": "Too far", "services.x.name": "y" }),
    );
    expect(result).toMatchObject({ success: true, data: { services: [{ name: "Check-up" }] } });
  });

  it("keeps secure reference links in order and refuses anything else", () => {
    expect(
      parseContentForm(
        form({
          "services.0.name": "Check-up",
          "referenceUrls.2": "https://b.example",
          "referenceUrls.0": "https://a.example",
          "referenceUrls.1": " ",
        }),
      ),
    ).toMatchObject({ success: true, data: { referenceUrls: ["https://a.example/", "https://b.example/"] } });

    expect(
      parseContentForm(form({ "services.0.name": "Check-up", "referenceUrls.0": "https://a.example", "referenceUrls.3": "javascript:alert(1)" })),
    ).toMatchObject({ success: false, field: "referenceUrls.3" });
  });

  it("stores each reference link normalised", () => {
    expect(
      parseContentForm(
        form({ "services.0.name": "Check-up", "referenceUrls.0": "  https://Studio.Example/Our Work?x=1#top " }),
      ),
    ).toMatchObject({ success: true, data: { referenceUrls: ["https://studio.example/Our%20Work?x=1#top"] } });
  });

  it("refuses a reference link over 500 characters, or one carrying a password", () => {
    const long = `https://a.example/${"x".repeat(500)}`;
    expect(parseContentForm(form({ "services.0.name": "Check-up", "referenceUrls.1": long }))).toMatchObject({
      success: false,
      field: "referenceUrls.1",
      message: "That link is too long.",
    });
    expect(
      parseContentForm(form({ "services.0.name": "Check-up", "referenceUrls.0": "https://me:secret@a.example" })),
    ).toMatchObject({ success: false, field: "referenceUrls.0" });
    expect(
      parseContentForm(form({ "services.0.name": "Check-up", "referenceUrls.0": "http://a.example" })),
    ).toMatchObject({ success: false, field: "referenceUrls.0" });
  });

  it("keeps line breaks in the notes", () => {
    expect(
      parseContentForm(form({ "services.0.name": "Check-up", notesForBuilder: "Line one.\r\nLine two." })),
    ).toMatchObject({ data: { notesForBuilder: "Line one.\nLine two." } });
  });

  describe("service ids", () => {
    const KEPT = "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d9e";
    const OTHER = "0192f6a4-7c1e-7d3a-9b2e-4f5a6b7c8d9f";

    it("carries the id of a saved service through, and leaves new rows without one", () => {
      const result = parseContentForm(
        form({
          "services.0.id": KEPT,
          "services.0.name": "Check-up",
          "services.1.name": "Whitening",
          "services.2.id": "",
          "services.2.name": "Braces",
        }),
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.services).toStrictEqual([
        { id: KEPT, name: "Check-up", summary: null, priceText: null },
        { name: "Whitening", summary: null, priceText: null },
        { name: "Braces", summary: null, priceText: null },
      ]);
    });

    it("keeps each id with its own row when the rows arrive reordered", () => {
      const result = parseContentForm(
        form({
          "services.1.id": KEPT,
          "services.1.name": "Second",
          "services.0.id": OTHER,
          "services.0.name": "First",
        }),
      );
      expect(result).toMatchObject({
        success: true,
        data: { services: [{ id: OTHER, name: "First" }, { id: KEPT, name: "Second" }] },
      });
    });

    it("treats a saved row whose text was cleared as removed", () => {
      const result = parseContentForm(
        form({ "services.0.id": KEPT, "services.0.name": " ", "services.1.name": "Whitening" }),
      );
      expect(result).toMatchObject({ success: true, data: { services: [{ name: "Whitening" }] } });
      if (result.success) expect(result.data.services[0]).not.toHaveProperty("id");
    });

    it("refuses an id that is not a UUID and points at that row's name", () => {
      expect(
        parseContentForm(form({ "services.0.name": "Check-up", "services.4.id": "1 OR 1=1", "services.4.name": "Braces" })),
      ).toEqual({
        success: false,
        message: "Your list of services has changed since this page loaded. Reload the page and try again.",
        field: "services.4.name",
      });
    });

    it("trims whitespace around an id", () => {
      expect(parseContentForm(form({ "services.0.id": ` ${KEPT} `, "services.0.name": "Check-up" }))).toMatchObject({
        success: true,
        data: { services: [{ id: KEPT }] },
      });
    });
  });
});
