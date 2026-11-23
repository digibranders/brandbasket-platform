// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extendSelection, stepCursor, toggleId } from "./data-table-logic";
import { mount, press } from "./dom-test-utils";
import { ShortcutHelp } from "./shortcut-help";
import { eventToSpec, formatKeys, isTypingTarget, resolveShortcut, SEQUENCE_WINDOW_MS, useShortcuts, type Shortcut } from "./use-shortcuts";
import { typeaheadIndex, wrapIndex } from "./row-actions";
import { orderItems, splitMatch } from "./command-bar";
import { toastDuration } from "./toast";

const noop = (): void => undefined;
const reg = (keys: string, extra: Partial<Shortcut> = {}): Shortcut => ({ id: keys, keys, label: keys, group: "Lists", run: noop, ...extra });

describe("shortcut registry", () => {
  it("turns key events into specs", () => {
    const base = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };
    expect(eventToSpec({ ...base, key: "j" })).toBe("j");
    expect(eventToSpec({ ...base, key: "J", shiftKey: true })).toBe("shift+j");
    expect(eventToSpec({ ...base, key: "?", shiftKey: true })).toBe("?");
    expect(eventToSpec({ ...base, key: "k", metaKey: true })).toBe("mod+k");
    expect(eventToSpec({ ...base, key: "F10", shiftKey: true })).toBe("shift+f10");
    expect(eventToSpec({ ...base, key: " " })).toBe("space");
    expect(eventToSpec({ ...base, key: "a", altKey: true })).toBeNull();
    expect(eventToSpec({ ...base, key: "Shift", shiftKey: true })).toBeNull();
  });

  it("matches singles and two key sequences inside the window only", () => {
    const list = [reg("j"), reg("g t"), reg("g o")];
    const first = resolveShortcut(list, "g", null, 1000, { inField: false });
    expect(first.match).toBeNull();
    expect(first.pending).toEqual({ spec: "g", at: 1000 });
    expect(resolveShortcut(list, "t", first.pending, 1000 + SEQUENCE_WINDOW_MS, { inField: false }).match?.keys).toBe("g t");
    expect(resolveShortcut(list, "o", first.pending, 1000 + SEQUENCE_WINDOW_MS, { inField: false }).match?.keys).toBe("g o");
    expect(resolveShortcut(list, "t", first.pending, 1001 + SEQUENCE_WINDOW_MS, { inField: false }).match).toBeNull();
    expect(resolveShortcut(list, "j", null, 0, { inField: false }).match?.keys).toBe("j");
  });

  it("skips single keys in fields and keeps only allowInField shortcuts", () => {
    const list = [reg("j"), reg("mod+k", { allowInField: true }), reg("x", { enabled: false })];
    expect(resolveShortcut(list, "j", null, 0, { inField: true }).match).toBeNull();
    expect(resolveShortcut(list, "mod+k", null, 0, { inField: true }).match?.keys).toBe("mod+k");
    expect(resolveShortcut(list, "x", null, 0, { inField: false }).match).toBeNull();
  });

  it("formats keys for display", () => {
    expect(formatKeys("mod+k")).toEqual(["Ctrl K"]);
    expect(formatKeys("g t")).toEqual(["g", "t"]);
    expect(formatKeys("shift+f10")).toEqual(["Shift F10"]);
  });
});

describe("useShortcuts and ShortcutHelp", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("runs a shortcut, ignores typing targets and open dialogs, and allows mod+k anywhere", async () => {
    const j = vi.fn();
    const k = vi.fn();
    const Probe = (): null => {
      useShortcuts([reg("j", { run: j }), reg("mod+k", { allowInField: true, run: k })]);
      return null;
    };
    const view = await mount(createElement(Probe));
    await press(document.body, "j");
    expect(j).toHaveBeenCalledTimes(1);

    const input = document.createElement("input");
    document.body.appendChild(input);
    await press(input, "j");
    expect(j).toHaveBeenCalledTimes(1);
    await press(input, "k", { ctrlKey: true });
    expect(k).toHaveBeenCalledTimes(1);

    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.appendChild(dialog);
    await press(document.body, "j");
    expect(j).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("treats checkboxes as not typing and text inputs as typing", () => {
    const box = document.createElement("input");
    box.type = "checkbox";
    const text = document.createElement("input");
    const area = document.createElement("textarea");
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(text)).toBe(true);
    expect(isTypingTarget(area)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });

  it("lists the same registry grouped Lists, Go to, Anywhere and returns focus on Esc", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const list = [reg("j", { label: "Next row" }), reg("g t", { label: "Go to Today", group: "Go to" }), reg("?", { label: "Show shortcuts", group: "Anywhere" }), reg("z", { label: "Hidden", enabled: false })];
    const view = await mount(createElement(ShortcutHelp, { open: true, onClose, shortcuts: list }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Next row");
    expect(text).toContain("Go to Today");
    expect(text).not.toContain("Hidden");
    expect(text.indexOf("Lists")).toBeLessThan(text.indexOf("Go to Today"));
    expect(document.querySelector("dialog")).not.toBeNull();
    await press(document, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.render(createElement(ShortcutHelp, { open: false, onClose, shortcuts: list }));
    expect(document.activeElement).toBe(opener);
    await view.unmount();
  });
});

describe("pure helpers", () => {
  it("steps the cursor and clamps at the ends", () => {
    const ids = ["a", "b", "c"];
    expect(stepCursor(ids, null, 1)).toBe("a");
    expect(stepCursor(ids, null, -1)).toBe("c");
    expect(stepCursor(ids, "a", -1)).toBe("a");
    expect(stepCursor(ids, "c", 1)).toBe("c");
    expect(stepCursor(ids, "a", 1)).toBe("b");
    expect(stepCursor([], null, 1)).toBeNull();
  });

  it("toggles and extends a selection", () => {
    expect([...toggleId(new Set(["a"]), "b")]).toEqual(["a", "b"]);
    expect([...toggleId(new Set(["a"]), "a")]).toEqual([]);
    expect([...extendSelection(["a", "b", "c", "d"], new Set(), "d", "b")].sort()).toEqual(["b", "c", "d"]);
  });

  it("wraps menu indexes and finds type-ahead matches", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(typeaheadIndex(["Add note", "Send quote", "Open client"], 0, "o")).toBe(2);
    expect(typeaheadIndex(["Add note", "Send quote"], 0, "z")).toBe(-1);
  });

  it("orders command items by group and marks the match", () => {
    const items = [
      { id: "1", group: "request" as const, title: "R" },
      { id: "2", group: "go" as const, title: "G" },
    ];
    expect(orderItems(items).map((i) => i.id)).toEqual(["2", "1"]);
    expect(splitMatch("Business", "sin")).toEqual([
      { text: "Bu", match: false },
      { text: "sin", match: true },
      { text: "ess", match: false },
    ]);
    expect(splitMatch("Business", "")).toEqual([{ text: "Business", match: false }]);
  });

  it("gives toasts the ruled durations", () => {
    expect(toastDuration({ message: "a" })).toBe(4000);
    expect(toastDuration({ message: "a", undo: async () => undefined })).toBe(10000);
    expect(toastDuration({ message: "a", tone: "error" })).toBeNull();
    expect(toastDuration({ message: "a", tone: "error", durationMs: 500 })).toBe(500);
  });
});
