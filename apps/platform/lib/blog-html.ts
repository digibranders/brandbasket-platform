import { escapeHtml } from "@firstfold/email";
import { asNodes, headingIds, headingLevel, inlineText, rootOf, type LexicalNode } from "./blog-text";

export { lexicalOutline, lexicalToPlainText, type OutlineHeading, type OutlineLevel } from "./blog-text";

/**
 * Turns a blog post's stored Lexical document into HTML for a client's own website to render.
 *
 * The grammar is closed and small on purpose: it is exactly what `components/panel/rich-text-editor.tsx`'s
 * toolbar can produce — paragraphs, two heading levels, quotes, dividers, bulleted and numbered lists, links, and
 * bold/italic/underline. Anything else is skipped rather than guessed at, so a future editor feature cannot silently
 * emit markup nobody reviewed onto a customer's public page.
 *
 * Every piece of customer text is escaped, and a link url is dropped unless it is http(s). This output is served
 * to client websites that will inject it into their own pages, so it has to be safe without them checking it.
 *
 * Headings carry an `id` (see `headingIds`) so a site can link a table of contents to them; `lexicalOutline` lists
 * the same headings with the same ids.
 */

/** Lexical stores inline formatting as a bitmask on each text node. */
const FORMAT_BOLD = 1;
const FORMAT_ITALIC = 2;
const FORMAT_UNDERLINE = 8;

/** Only http(s) may become an href. See `lib/safe-link.ts` for the same rule applied to stored staff links. */
function safeHref(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function linkUrlOf(node: LexicalNode): unknown {
  return node.url ?? node.fields?.url;
}

function renderText(node: LexicalNode): string {
  const value = typeof node.text === "string" ? node.text : "";
  if (value === "") return "";
  const format = typeof node.format === "number" ? node.format : 0;
  let html = escapeHtml(value);
  // Innermost first, so the nesting reads bold > italic > underline outwards.
  if ((format & FORMAT_UNDERLINE) !== 0) html = `<u>${html}</u>`;
  if ((format & FORMAT_ITALIC) !== 0) html = `<em>${html}</em>`;
  if ((format & FORMAT_BOLD) !== 0) html = `<strong>${html}</strong>`;
  return html;
}

function renderDocument(root: LexicalNode): string {
  const nextHeadingId = headingIds();

  function renderChildren(node: LexicalNode): string {
    return asNodes(node.children).map(renderNode).join("");
  }

  function renderNode(node: LexicalNode): string {
    switch (node.type) {
      case "text":
        return renderText(node);
      case "linebreak":
        return "<br />";
      case "paragraph": {
        const inner = renderChildren(node);
        return inner === "" ? "" : `<p>${inner}</p>`;
      }
      case "heading": {
        // The toolbar offers h2 and h3 only; h1 belongs to the page's own title.
        const tag = `h${headingLevel(node.tag)}`;
        // A heading with no words is left out, here and in lexicalOutline, so both hand out the same ids.
        const text = inlineText(node);
        if (text === "") return "";
        return `<${tag} id="${nextHeadingId(text)}">${renderChildren(node)}</${tag}>`;
      }
      case "quote": {
        const inner = renderChildren(node);
        return inner === "" ? "" : `<blockquote>${inner}</blockquote>`;
      }
      case "horizontalrule":
        return "<hr />";
      case "list": {
        const tag = node.listType === "number" ? "ol" : "ul";
        return `<${tag}>${renderChildren(node)}</${tag}>`;
      }
      case "listitem":
        return `<li>${renderChildren(node)}</li>`;
      case "link":
      case "autolink": {
        const href = safeHref(linkUrlOf(node));
        const inner = renderChildren(node);
        // A refused url still shows its text: the customer wrote it, it just does not become clickable.
        return href === null ? inner : `<a href="${escapeHtml(href)}" rel="nofollow noopener">${inner}</a>`;
      }
      default:
        return "";
    }
  }

  return renderChildren(root);
}

/** Null, undefined and anything not shaped like a Lexical document all render as no content. */
export function lexicalToHtml(document: unknown): string {
  const root = rootOf(document);
  return root === null ? "" : renderDocument(root);
}
