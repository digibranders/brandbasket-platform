import { describe, expect, it } from "vitest";
import { lexicalOutline, lexicalToHtml, lexicalToPlainText } from "./blog-html";

/** The shape Payload's lexical editor stores. Only the nodes this app's toolbar can produce appear here. */
function doc(...children: readonly unknown[]) {
  return { root: { type: "root", children } };
}

function text(value: string, format = 0) {
  return { type: "text", text: value, format };
}

describe("lexicalToHtml", () => {
  it("renders a paragraph", () => {
    expect(lexicalToHtml(doc({ type: "paragraph", children: [text("Hello there.")] }))).toBe("<p>Hello there.</p>");
  });

  it("renders the two heading levels the toolbar offers, each with an id a table of contents can link to", () => {
    expect(lexicalToHtml(doc({ type: "heading", tag: "h2", children: [text("Big")] }))).toBe('<h2 id="big">Big</h2>');
    expect(lexicalToHtml(doc({ type: "heading", tag: "h3", children: [text("Small")] }))).toBe('<h3 id="small">Small</h3>');
  });

  it("writes a stray h1 as h2, since the page title is the h1", () => {
    expect(lexicalToHtml(doc({ type: "heading", tag: "h1", children: [text("Title")] }))).toBe('<h2 id="title">Title</h2>');
  });

  it("gives repeated headings distinct ids and leaves out headings with no words", () => {
    expect(
      lexicalToHtml(
        doc(
          { type: "heading", tag: "h2", children: [text("Opening hours & prices")] },
          { type: "heading", tag: "h2", children: [] },
          { type: "heading", tag: "h3", children: [text("Opening hours & prices")] },
        ),
      ),
    ).toBe('<h2 id="opening-hours-prices">Opening hours &amp; prices</h2><h3 id="opening-hours-prices-2">Opening hours &amp; prices</h3>');
  });

  it("renders a quote and a divider", () => {
    expect(lexicalToHtml(doc({ type: "quote", children: [text("Said well.")] }, { type: "horizontalrule" }))).toBe(
      "<blockquote>Said well.</blockquote><hr />",
    );
  });

  it("renders a nested list inside its parent item", () => {
    const nested = doc({
      type: "list",
      listType: "bullet",
      children: [
        { type: "listitem", children: [text("one")] },
        { type: "listitem", children: [{ type: "list", listType: "number", children: [{ type: "listitem", children: [text("a")] }] }] },
      ],
    });
    expect(lexicalToHtml(nested)).toBe("<ul><li>one</li><li><ol><li>a</li></ol></li></ul>");
  });

  it("renders both list types with their items", () => {
    const bullet = doc({
      type: "list",
      listType: "bullet",
      children: [
        { type: "listitem", children: [text("one")] },
        { type: "listitem", children: [text("two")] },
      ],
    });
    expect(lexicalToHtml(bullet)).toBe("<ul><li>one</li><li>two</li></ul>");

    const numbered = doc({
      type: "list",
      listType: "number",
      children: [{ type: "listitem", children: [text("first")] }],
    });
    expect(lexicalToHtml(numbered)).toBe("<ol><li>first</li></ol>");
  });

  // Lexical stores inline formatting as a bitmask: 1 bold, 2 italic, 8 underline.
  it("applies bold, italic and underline, including in combination", () => {
    expect(lexicalToHtml(doc({ type: "paragraph", children: [text("b", 1)] }))).toBe("<p><strong>b</strong></p>");
    expect(lexicalToHtml(doc({ type: "paragraph", children: [text("i", 2)] }))).toBe("<p><em>i</em></p>");
    expect(lexicalToHtml(doc({ type: "paragraph", children: [text("u", 8)] }))).toBe("<p><u>u</u></p>");
    expect(lexicalToHtml(doc({ type: "paragraph", children: [text("all", 11)] }))).toBe(
      "<p><strong><em><u>all</u></em></strong></p>",
    );
  });

  // The dashboard's editor (@lexical/link) stores the address on the node itself, not under `fields`.
  it("renders a link the dashboard editor wrote", () => {
    const written = doc({
      type: "paragraph",
      children: [{ type: "link", url: "https://example.com/book", rel: null, target: null, children: [text("Book")] }],
    });
    expect(lexicalToHtml(written)).toBe('<p><a href="https://example.com/book" rel="nofollow noopener">Book</a></p>');
  });

  it("renders a link, and refuses a scheme that is not http or https", () => {
    const safe = doc({
      type: "paragraph",
      children: [{ type: "link", fields: { url: "https://example.com" }, children: [text("click")] }],
    });
    // The href is the parsed form, so a bare origin gains its trailing slash. That is the url that was validated.
    expect(lexicalToHtml(safe)).toBe('<p><a href="https://example.com/" rel="nofollow noopener">click</a></p>');

    // A javascript: url must never reach a client's public page. The text survives, the link does not.
    const unsafe = doc({
      type: "paragraph",
      children: [{ type: "link", fields: { url: "javascript:alert(1)" }, children: [text("click")] }],
    });
    expect(lexicalToHtml(unsafe)).toBe("<p>click</p>");
  });

  it("escapes html in the customer's own text", () => {
    expect(lexicalToHtml(doc({ type: "paragraph", children: [text('<script>alert("x")</script>')] }))).toBe(
      "<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
  });

  it("returns an empty string for an empty or malformed document", () => {
    expect(lexicalToHtml(null)).toBe("");
    expect(lexicalToHtml(undefined)).toBe("");
    expect(lexicalToHtml({})).toBe("");
    expect(lexicalToHtml(doc())).toBe("");
  });

  it("skips a node type it does not know rather than throwing", () => {
    expect(lexicalToHtml(doc({ type: "someFutureBlock", children: [text("x")] }, { type: "paragraph", children: [text("ok")] }))).toBe(
      "<p>ok</p>",
    );
  });
});

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
    expect(lexicalToHtml(body)).toContain('<h2 id="prices-2">');
  });

  it("is empty for a missing document or one with no headings", () => {
    expect(lexicalOutline(null)).toEqual([]);
    expect(lexicalOutline(doc({ type: "paragraph", children: [text("x")] }))).toEqual([]);
  });
});
