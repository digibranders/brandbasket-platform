import { describe, expect, it } from "vitest";
import { bodyJsonOf, countWords, EMPTY_BODY, EMPTY_BODY_JSON, lexicalOutline, lexicalToPlainText, readingMinutes } from "./body";

/** The shape Payload's lexical editor stores. Only the nodes this app's toolbar can produce appear here. */
function doc(...children: readonly unknown[]) {
  return { root: { type: "root", children } };
}

function text(value: string, format = 0) {
  return { type: "text", text: value, format };
}

function paragraph(value: string) {
  return { type: "paragraph", children: [text(value)] };
}

describe("lexicalToPlainText", () => {
  it("separates blocks with spaces and drops formatting", () => {
    expect(
      lexicalToPlainText(
        doc(
          { type: "heading", tag: "h2", children: [text("Menu", 1)] },
          { type: "paragraph", children: [text("Fresh "), text("bread", 2)] },
          { type: "list", listType: "bullet", children: [{ type: "listitem", children: [text("Tea")] }, { type: "listitem", children: [text("Cake")] }] },
        ),
      ),
    ).toBe("Menu Fresh bread Tea Cake");
  });

  it("keeps link text and skips nodes the HTML skips", () => {
    expect(
      lexicalToPlainText(
        doc(
          { type: "paragraph", children: [{ type: "link", fields: { url: "https://x.test" }, children: [text("Book now")] }] },
          { type: "someFutureBlock", children: [text("hidden")] },
        ),
      ),
    ).toBe("Book now");
  });

  it("includes a quote's words", () => {
    expect(lexicalToPlainText(doc({ type: "quote", children: [text("Said")] }, { type: "horizontalrule" }))).toBe("Said");
  });

  it("is empty for a missing or malformed document", () => {
    expect(lexicalToPlainText(null)).toBe("");
    expect(lexicalToPlainText({})).toBe("");
  });
});

describe("lexicalOutline", () => {
  it("lists headings in order with the same ids the html gives them", () => {
    const body = doc(
      { type: "heading", tag: "h2", children: [text("Prices")] },
      { type: "paragraph", children: [text("Lots")] },
      { type: "heading", tag: "h3", children: [text("Kids"), text(" ", 0), text("classes", 1)] },
      { type: "heading", tag: "h2", children: [text("Prices")] },
    );
    expect(lexicalOutline(body)).toEqual([
      { id: "prices", text: "Prices", level: 2 },
      { id: "kids-classes", text: "Kids classes", level: 3 },
      { id: "prices-2", text: "Prices", level: 2 },
    ]);
  });

  it("is empty for a missing document or one with no headings", () => {
    expect(lexicalOutline(null)).toEqual([]);
    expect(lexicalOutline(doc({ type: "paragraph", children: [text("x")] }))).toEqual([]);
  });
});

describe("countWords", () => {
  it("counts words separated by any whitespace", () => {
    expect(countWords("  Fresh bread\n every   morning ")).toBe(4);
  });

  it("is zero for blank text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("readingMinutes", () => {
  it("rounds up to whole minutes, with at least one for a short post", () => {
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
  });

  it("is zero for an empty post", () => {
    expect(readingMinutes(0)).toBe(0);
  });
});

describe("bodyJsonOf", () => {
  it("starts a post with no body from the empty document", () => {
    expect(bodyJsonOf(null)).toBe(EMPTY_BODY_JSON);
    expect(JSON.parse(EMPTY_BODY_JSON)).toEqual(EMPTY_BODY);
  });

  it("keeps a stored body as it is", () => {
    expect(JSON.parse(bodyJsonOf(doc(paragraph("Hi"))))).toEqual(doc(paragraph("Hi")));
  });
});
