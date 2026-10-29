import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/app-host/(support)/support/actions", () => ({ replyToSupportRequest: vi.fn() }));
vi.mock("@/app/app-host/(protected)/requests/actions", () => ({ askForChangeAction: vi.fn() }));

import { ReplyForm } from "@/components/requests/reply-form";
import { AskForm } from "@/components/requests/ask-form";
import { REPLY_MAX_HEIGHT_PX, isSendShortcut, replyHeight } from "@/lib/reply-bar";
import { intentOptions } from "@/lib/requests/form";

const PRIVACY = "Hide any personal information before uploading";

function reply(sendLabel = "Send"): string {
  return renderToStaticMarkup(createElement(ReplyForm, { ticketId: "t1", submissionKey: "reply-key-12345678", sendLabel })).replaceAll("<!-- -->", "");
}

it("sends on Cmd+Enter and Ctrl+Enter only; plain and Shift+Enter make a new line", () => {
  expect(isSendShortcut({ key: "Enter", metaKey: true, ctrlKey: false })).toBe(true);
  expect(isSendShortcut({ key: "Enter", metaKey: false, ctrlKey: true })).toBe(true);
  expect(isSendShortcut({ key: "Enter", metaKey: false, ctrlKey: false })).toBe(false);
  expect(isSendShortcut({ key: "a", metaKey: true, ctrlKey: false })).toBe(false);
});

it("grows with the text and stops at about six lines, then scrolls", () => {
  expect(replyHeight(34)).toBe(36);
  expect(replyHeight(54)).toBe(56);
  expect(replyHeight(10_000)).toBe(REPLY_MAX_HEIGHT_PX);
  expect(REPLY_MAX_HEIGHT_PX).toBe(136);
});

it("the reply bar is one line: a one-row field, a paperclip with a label, and Send in the same bar", () => {
  const html = reply();
  expect(html).toContain('rows="1"');
  expect(html).toContain('placeholder="Write a reply"');
  expect(html).toContain('aria-label="Attach screenshots"');
  expect(html).toContain(">Send<");
  expect(html.indexOf('aria-label="Attach screenshots"')).toBeLessThan(html.indexOf("<textarea"));
  expect(html.indexOf("<textarea")).toBeLessThan(html.indexOf(">Send<"));
});

it("the reply bar has no permanent screenshots block or privacy note", () => {
  const html = reply();
  for (const gone of ["Screenshots", "Choose files", "or paste screenshots", "Up to 3 images", PRIVACY]) expect(html).not.toContain(gone);
  expect(html).toContain('accept="image/png,image/jpeg,image/webp"');
});

it("keeps the Ask for a fix label while a change waits", () => {
  expect(reply("Ask for a fix")).toContain(">Ask for a fix<");
});

it("the new request form keeps the full screenshots block", () => {
  const html = renderToStaticMarkup(createElement(AskForm, { options: intentOptions(["website"]), submissionKey: "ask-key-12345678" })).replaceAll("<!-- -->", "");
  for (const kept of ["Screenshots", "Choose files", "or paste screenshots from clipboard", "Up to 3 images, 4 MB each (PNG, JPEG, WebP).", PRIVACY]) expect(html).toContain(kept);
});
