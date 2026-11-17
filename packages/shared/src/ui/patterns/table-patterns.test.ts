// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buttonByText, click, mount, press } from "./dom-test-utils";
import { DataTable, type Column } from "./data-table";
import { RowActions, type RowActionItem } from "./row-actions";

interface Work {
  readonly id: string;
  readonly name: string;
  readonly age: string;
}

const ROWS: readonly Work[] = [
  { id: "a", name: "Alpha", age: "5h" },
  { id: "b", name: "Bravo", age: "42m" },
  { id: "c", name: "Charlie", age: "3d" },
];

const COLUMNS: readonly Column<Work>[] = [
  { id: "name", header: "Work", cell: (row) => row.name },
  { id: "type", header: "Type", hideBelow: "sm", cell: () => "Support" },
  { id: "age", header: "Waiting", align: "end", cell: (row) => row.age },
];

afterEach(() => {
  document.body.innerHTML = "";
});

const items = (onSelect = vi.fn()): readonly RowActionItem[] => [
  { id: "note", label: "Add internal note", onSelect },
  { id: "quote", label: "Send quote", onSelect, disabledReason: "Quote not paid yet" },
  { id: "open", label: "Open client", onSelect },
  { id: "close", label: "Close request", onSelect, destructive: true, confirm: { title: "Close request?", consequence: "It cannot be reopened.", confirmLabel: "Close request" } },
];

describe("RowActions", () => {
  it("renders the verb and a labelled menu button at 36px, 44px on phone", async () => {
    const view = await mount(createElement(RowActions, { verb: { label: "Reply", onRun: vi.fn() }, items: items() }));
    const verb = buttonByText(view.container, "Reply");
    expect(verb.className).toContain("h-9");
    expect(verb.className).toContain("max-[860px]:h-11");
    expect(verb.className).toContain("no-underline");
    const dots = buttonByText(view.container, "More actions");
    expect(dots.getAttribute("aria-haspopup")).toBe("menu");
    expect(dots.getAttribute("aria-expanded")).toBe("false");
    await view.unmount();
  });

  it("opens with focus on the first enabled item, moves with arrows and returns focus to the dots on Esc", async () => {
    const view = await mount(createElement(RowActions, { items: [{ id: "x", label: "Disabled first", onSelect: vi.fn(), disabledReason: "Not yet" }, ...items()] }));
    const dots = buttonByText(view.container, "More actions");
    dots.focus();
    await click(dots);
    const menu = document.querySelector("[role='menu']") as HTMLElement;
    expect(menu).not.toBeNull();
    const nodes = Array.from(menu.querySelectorAll<HTMLElement>("[role='menuitem']"));
    expect(document.activeElement).toBe(nodes[1]);
    await press(nodes[1] as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(nodes[2]);
    await press(document.activeElement as HTMLElement, "End");
    expect(document.activeElement).toBe(nodes[nodes.length - 1]);
    await press(document.activeElement as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(nodes[0]);
    await press(document.activeElement as HTMLElement, "o");
    expect(document.activeElement?.textContent).toContain("Open client");
    await press(document.activeElement as HTMLElement, "Escape");
    expect(document.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(dots);
    await view.unmount();
  });

  it("closes on Tab and returns focus to the dots", async () => {
    const view = await mount(createElement(RowActions, { items: items() }));
    const dots = buttonByText(view.container, "More actions");
    await click(dots);
    await press(document.activeElement as HTMLElement, "Tab");
    expect(document.querySelector("[role='menu']")).toBeNull();
    expect(document.activeElement).toBe(dots);
    await view.unmount();
  });

  it("keeps disabled items focusable, shows the reason and does not run them", async () => {
    const onSelect = vi.fn();
    const view = await mount(createElement(RowActions, { items: items(onSelect) }));
    await click(buttonByText(view.container, "More actions"));
    const quote = Array.from(document.querySelectorAll<HTMLElement>("[role='menuitem']")).find((n) => n.textContent?.includes("Send quote")) as HTMLElement;
    expect(quote.getAttribute("aria-disabled")).toBe("true");
    expect(quote.textContent).toContain("Quote not paid yet");
    quote.focus();
    expect(document.activeElement).toBe(quote);
    await click(quote);
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector("[role='menu']")).not.toBeNull();
    await view.unmount();
  });

  it("separates the destructive item, confirms it, and runs it only after the confirm", async () => {
    const onSelect = vi.fn();
    const view = await mount(createElement(RowActions, { items: items(onSelect) }));
    await click(buttonByText(view.container, "More actions"));
    expect(document.querySelector("[role='separator']")).not.toBeNull();
    const close = Array.from(document.querySelectorAll<HTMLElement>("[role='menuitem']")).pop() as HTMLElement;
    expect(close.className).toContain("text-neg-text");
    await click(close);
    expect(onSelect).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")?.textContent).toContain("Close request?");
    await click(buttonByText(document.body, "Keep"));
    expect(onSelect).not.toHaveBeenCalled();
    await click(buttonByText(view.container, "More actions"));
    await click(Array.from(document.querySelectorAll<HTMLElement>("[role='menuitem']")).pop() as HTMLElement);
    await click(buttonByText(document.body, "Close request"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("shows busy, disables the menu and refuses a second run", async () => {
    const onRun = vi.fn();
    const view = await mount(createElement(RowActions, { verb: { label: "Reply", onRun, busy: true, busyLabel: "Sending" }, items: items() }));
    const verb = view.container.querySelector("button[aria-busy='true']") as HTMLButtonElement;
    expect(verb.textContent).toBe("Sending...");
    expect(verb.disabled).toBe(true);
    expect((buttonByText(view.container, "More actions") as HTMLButtonElement).disabled).toBe(true);
    await view.unmount();
  });

  it("explains a disabled verb and does not run it", async () => {
    const onRun = vi.fn();
    const view = await mount(createElement(RowActions, { verb: { label: "Resend", onRun, disabledReason: "Sent a minute ago" }, items: [] }));
    const verb = buttonByText(view.container, "Resend");
    expect(verb.getAttribute("aria-disabled")).toBe("true");
    expect(verb.title).toBe("Sent a minute ago");
    await click(verb);
    expect(onRun).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("refuses more than five items and a destructive item that is not last", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), label: `Item ${i}`, onSelect: vi.fn() }));
    expect(() => renderToStaticMarkup(createElement(RowActions, { items: many }))).toThrow("at most 5");
    const misplaced = [
      { id: "d", label: "Delete", onSelect: vi.fn(), destructive: true },
      { id: "o", label: "Other", onSelect: vi.fn() },
    ];
    expect(() => renderToStaticMarkup(createElement(RowActions, { items: misplaced }))).toThrow("destructive");
  });
});

describe("DataTable", () => {
  const base = { label: "Today", columns: COLUMNS, rows: ROWS, rowId: (row: Work) => row.id, state: "ready" as const };

  it("renders 44px rows, a sticky 36px header, mono ages aligned end and hides a column on phone", async () => {
    const view = await mount(createElement(DataTable<Work>, base));
    const row = view.container.querySelector("tbody td") as HTMLElement;
    expect(row.className).toContain("h-11");
    const head = view.container.querySelector("thead th") as HTMLElement;
    expect(head.className).toContain("h-9");
    expect(head.className).toContain("sticky");
    const headers = Array.from(view.container.querySelectorAll("thead th"));
    expect(headers[1]?.className).toContain("max-[860px]:hidden");
    expect(headers[2]?.className).toContain("text-right");
    expect(view.container.querySelector("table")?.getAttribute("aria-label")).toBe("Today");
    await view.unmount();
  });

  it("uses 36px rows only for the compact density", async () => {
    const view = await mount(createElement(DataTable<Work>, { ...base, density: "compact" }));
    expect((view.container.querySelector("tbody td") as HTMLElement).className).toContain("h-9");
    await view.unmount();
  });

  it("renders loading skeleton rows, empty and error content", async () => {
    const loading = await mount(createElement(DataTable<Work>, { ...base, state: "loading" }));
    expect(loading.container.querySelectorAll(".motion-pulse").length).toBe(3);
    expect(loading.container.textContent).toContain("Work");
    expect(loading.container.querySelector("table")?.getAttribute("aria-busy")).toBe("true");
    await loading.unmount();
    const empty = await mount(createElement(DataTable<Work>, { ...base, rows: [], state: "empty", empty: createElement("p", null, "Nothing needs you right now") }));
    expect(empty.container.textContent).toContain("Nothing needs you right now");
    await empty.unmount();
    const failed = await mount(createElement(DataTable<Work>, { ...base, rows: [], state: "error", error: createElement("p", null, "The list did not load") }));
    expect(failed.container.textContent).toContain("The list did not load");
    await failed.unmount();
  });

  it("moves the cursor with j and k, opens with Enter and keeps the cursor row as the active descendant", async () => {
    const onOpen = vi.fn();
    const view = await mount(createElement(DataTable<Work>, { ...base, onOpen }));
    const table = view.container.querySelector("table") as HTMLElement;
    table.focus();
    await press(table, "j");
    await press(table, "j");
    const active = table.getAttribute("aria-activedescendant") as string;
    expect(document.getElementById(active)?.textContent).toContain("Bravo");
    await press(table, "k");
    expect(document.getElementById(table.getAttribute("aria-activedescendant") as string)?.textContent).toContain("Alpha");
    await press(table, "Enter");
    expect(onOpen).toHaveBeenCalledWith("a");
    await view.unmount();
  });

  it("selects with x and Space, extends with Shift, selects all with Ctrl A and clears with Esc", async () => {
    const changes: string[][] = [];
    const view = await mount(createElement(DataTable<Work>, { ...base, selectable: true, onSelectionChange: (ids) => changes.push([...ids].sort()) }));
    const table = view.container.querySelector("table") as HTMLElement;
    table.focus();
    await press(table, "j");
    await press(table, "x");
    expect(changes.at(-1)).toEqual(["a"]);
    await press(table, "j", { shiftKey: true });
    await press(table, "J", { shiftKey: true });
    expect(changes.at(-1)).toEqual(["a", "b", "c"]);
    await press(table, "Escape");
    expect(changes.at(-1)).toEqual([]);
    await press(table, "a", { ctrlKey: true });
    expect(changes.at(-1)).toEqual(["a", "b", "c"]);
    await press(table, "Escape");
    await press(table, "k");
    await press(table, " ");
    expect(changes.at(-1)).toEqual(["b"]);
    expect(view.container.querySelectorAll("tr[aria-selected='true']").length).toBe(1);
    await view.unmount();
  });

  it("marks selected and open rows with the gold wash and 3px marker, and the cursor with a 2px ink marker", async () => {
    const view = await mount(createElement(DataTable<Work>, { ...base, selectable: true, selectedIds: new Set(["a"]), openId: "b" }));
    const rows = Array.from(view.container.querySelectorAll<HTMLElement>("tbody tr"));
    expect(rows[0]?.className).toContain("bg-gold-soft");
    expect(rows[0]?.className).toContain("inset_3px_0_0_var(--color-accent-gold)");
    expect(rows[1]?.className).toContain("bg-gold-soft");
    expect(rows[2]?.className).not.toContain("bg-gold-soft");
    const table = view.container.querySelector("table") as HTMLElement;
    table.focus();
    await press(table, "j");
    await press(table, "j");
    await press(table, "j");
    expect((view.container.querySelectorAll<HTMLElement>("tbody tr")[2] as HTMLElement).className).toContain("inset_2px_0_0_var(--color-ink-2)");
    await view.unmount();
  });

  it("runs the row verb with e, asks first when it has a confirm, and skips disabled rows", async () => {
    const run = vi.fn();
    const view = await mount(
      createElement(DataTable<Work>, {
        ...base,
        isDisabledRow: (row: Work) => (row.id === "c" ? "Waiting on customer" : null),
        primaryVerb: (row: Work) => ({
          label: row.id === "a" ? "Send" : "Contact",
          onRun: () => run(row.id),
          confirm: row.id === "a" ? { title: "Send setup link?", consequence: "It emails the owner.", confirmLabel: "Send link" } : undefined,
        }),
      }),
    );
    const table = view.container.querySelector("table") as HTMLElement;
    table.focus();
    await press(table, "j");
    await press(table, "e");
    expect(run).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")?.textContent).toContain("Send setup link?");
    await click(buttonByText(document.body, "Send link"));
    expect(run).toHaveBeenCalledWith("a");
    await press(table, "j");
    await press(table, "e");
    expect(run).toHaveBeenLastCalledWith("b");
    await press(table, "j");
    await press(table, "e");
    expect(run).toHaveBeenCalledTimes(2);
    const disabledVerb = Array.from(view.container.querySelectorAll<HTMLButtonElement>("tbody tr:last-child button")).find((b) => b.textContent === "Contact");
    expect(disabledVerb?.title).toBe("Waiting on customer");
    expect((view.container.querySelectorAll<HTMLInputElement>("input[type='checkbox']").length)).toBe(0);
    await view.unmount();
  });

  it("opens the row menu with the dot key and from a right click only on the actions cell", async () => {
    const view = await mount(createElement(DataTable<Work>, { ...base, menu: () => items() }));
    const table = view.container.querySelector("table") as HTMLElement;
    table.focus();
    await press(table, "j");
    await press(table, ".");
    expect(document.querySelector("[role='menu']")).not.toBeNull();
    await press(document.activeElement as HTMLElement, "Escape");
    expect(document.querySelector("[role='menu']")).toBeNull();

    const nameCell = view.container.querySelector("tbody tr:nth-child(2) td") as HTMLElement;
    await mountContext(nameCell);
    expect(document.querySelector("[role='menu']")).toBeNull();
    const actionsCell = view.container.querySelector("tbody tr:nth-child(2) td:last-child") as HTMLElement;
    await mountContext(actionsCell);
    expect(document.querySelector("[role='menu']")).not.toBeNull();
    await view.unmount();
  });

  it("renders group bands with counts", async () => {
    const view = await mount(
      createElement(DataTable<Work>, {
        ...base,
        groups: [
          { id: "late", label: "Late", count: 2 },
          { id: "due", label: "Due today", count: 1 },
        ],
        rowGroup: (row: Work) => (row.id === "c" ? "due" : "late"),
      }),
    );
    const bands = Array.from(view.container.querySelectorAll("th[scope='rowgroup']")).map((n) => n.textContent);
    expect(bands).toEqual(["Late 2", "Due today 1"]);
    await view.unmount();
  });

  it("calls onOpen when a row is clicked but not when a button inside it is", async () => {
    const onOpen = vi.fn();
    const view = await mount(createElement(DataTable<Work>, { ...base, onOpen, primaryVerb: () => ({ label: "Go", onRun: vi.fn() }) }));
    await click(view.container.querySelector("tbody tr td") as HTMLElement);
    expect(onOpen).toHaveBeenCalledWith("a");
    onOpen.mockClear();
    await click(buttonByText(view.container, "Go"));
    expect(onOpen).not.toHaveBeenCalled();
    await view.unmount();
  });
});

async function mountContext(target: HTMLElement): Promise<void> {
  const { act } = await import("react");
  await act(async () => {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
}
