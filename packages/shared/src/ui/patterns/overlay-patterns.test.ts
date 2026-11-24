// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BulkBar, type BulkAction } from "./bulk-bar";
import { CommandBar, type CommandItem } from "./command-bar";
import { buttonByText, click, mount, press, type } from "./dom-test-utils";
import { FilterBar } from "./filter-bar";
import { InlineEdit } from "./inline-edit";
import { SidePanel, useUrlParam } from "./side-panel";
import { ToastRegion, toastStore } from "./toast";

function stubMedia(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  Object.defineProperty(window, "matchMedia", { configurable: true, writable: true, value: (query: string) => ({ matches, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) });
}

afterEach(() => {
  document.body.innerHTML = "";
  toastStore.reset();
  vi.useRealTimers();
});

describe("SidePanel", () => {
  const props = { title: "Acme Bakery", onClose: vi.fn(), children: createElement("p", null, "Detail") };

  it("is a complementary region on wide screens, moves focus to the heading and returns it to the opener on Esc", async () => {
    stubMedia(false);
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const view = await mount(createElement(SidePanel, { ...props, onClose, open: false }));
    await view.render(createElement(SidePanel, { ...props, onClose, open: true }));
    const panel = document.querySelector("aside") as HTMLElement;
    expect(panel.getAttribute("role")).toBe("complementary");
    expect(panel.getAttribute("aria-label")).toBe("Acme Bakery");
    expect(document.activeElement?.tagName).toBe("H2");
    expect(document.querySelector("[aria-label='Close panel']")).not.toBeNull();
    await press(document, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await view.render(createElement(SidePanel, { ...props, onClose, open: false }));
    expect(document.activeElement).toBe(opener);
    await view.unmount();
  });

  it("does not trap focus on wide screens but does on a phone sheet, with a scrim and a back button", async () => {
    stubMedia(false);
    const wide = await mount(createElement(SidePanel, { ...props, open: true, primary: { label: "Reply", onRun: vi.fn() } }));
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const lastWide = document.querySelector("aside footer button") as HTMLElement;
    lastWide.focus();
    const tabWide = await press(lastWide, "Tab");
    expect(tabWide.defaultPrevented).toBe(false);
    await wide.unmount();

    stubMedia(true);
    const view = await mount(createElement(SidePanel, { ...props, open: true, primary: { label: "Reply", onRun: vi.fn() } }));
    const panel = document.querySelector("aside") as HTMLElement;
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector("[aria-label='Back to list']")).not.toBeNull();
    expect(document.querySelector(".fixed.inset-0")).not.toBeNull();
    const last = panel.querySelector("footer button") as HTMLElement;
    last.focus();
    const tab = await press(last, "Tab");
    expect(tab.defaultPrevented).toBe(true);
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(last);
    await view.unmount();
  });

  it("steps with j and k, runs the primary with e and ignores keys typed in a field", async () => {
    stubMedia(false);
    const onStep = vi.fn();
    const onRun = vi.fn();
    const view = await mount(createElement(SidePanel, { ...props, open: true, onStep, primary: { label: "Reply", onRun }, children: createElement("input", { "aria-label": "Note" }) }));
    const heading = document.querySelector("h2") as HTMLElement;
    await press(heading, "j");
    await press(heading, "k");
    expect(onStep.mock.calls).toEqual([[1], [-1]]);
    await press(heading, "e");
    expect(onRun).toHaveBeenCalledTimes(1);
    await press(document.querySelector("input") as HTMLElement, "j");
    expect(onStep).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it("disables the primary while loading and offers Try again on error", async () => {
    stubMedia(false);
    const onRetry = vi.fn();
    const onRun = vi.fn();
    const view = await mount(createElement(SidePanel, { ...props, open: true, state: "loading", primary: { label: "Reply", onRun } }));
    expect(document.querySelector("[role='status'][aria-label='Loading detail']")).not.toBeNull();
    expect((buttonByText(document.body, "Reply") as HTMLButtonElement).disabled).toBe(true);
    await view.render(createElement(SidePanel, { ...props, open: true, state: "error", onRetry }));
    await click(buttonByText(document.body, "Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it("keeps its URL in ?open= without reloading", async () => {
    window.history.replaceState(null, "", "/work?x=1");
    let current: readonly [string | null, (v: string | null) => void] = [null, () => undefined];
    const Probe = (): null => {
      current = useUrlParam("open");
      return null;
    };
    const view = await mount(createElement(Probe));
    await act(async () => current[1]("req-7"));
    expect(window.location.search).toBe("?x=1&open=req-7");
    expect(current[0]).toBe("req-7");
    await act(async () => current[1](null));
    expect(window.location.search).toBe("?x=1");
    expect(current[0]).toBeNull();
    await view.unmount();
  });
});

describe("FilterBar", () => {
  const options = [
    { id: "all", label: "All", count: 9 },
    { id: "late", label: "Late", count: 2, tone: "late" as const },
    { id: "money", label: "Money", count: null },
  ];

  it("shows pills with counts, a failed count as ?, and the selected pill as pressed", async () => {
    const view = await mount(createElement(FilterBar, { options, value: "late", onChange: vi.fn() }));
    const pills = Array.from(view.container.querySelectorAll("button"));
    expect(pills.map((p) => p.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(pills[2]?.textContent).toBe("Money?");
    expect(pills[1]?.className).toContain("bg-ink");
    expect(view.container.firstElementChild?.className).toContain("sticky");
    await view.unmount();
  });

  it("is one tab stop with Left and Right moving between pills, and Enter applies", async () => {
    const onChange = vi.fn();
    const view = await mount(createElement(FilterBar, { options, value: "all", onChange }));
    const pills = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));
    expect(pills.map((p) => p.tabIndex)).toEqual([0, -1, -1]);
    pills[0]?.focus();
    await press(pills[0] as HTMLElement, "ArrowRight");
    expect(document.activeElement).toBe(pills[1]);
    await press(pills[1] as HTMLElement, "ArrowLeft");
    await press(pills[0] as HTMLElement, "ArrowLeft");
    expect(document.activeElement).toBe(pills[2]);
    await click(pills[1] as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("late");
    await view.unmount();
  });

  it("focuses the search with /, clears it on Esc and moves to the table on a second Esc", async () => {
    const onSearch = vi.fn();
    const table = document.createElement("div");
    table.tabIndex = 0;
    document.body.appendChild(table);
    const view = await mount(createElement(FilterBar, { options, value: "all", onChange: vi.fn(), search: { value: "zzz", onChange: onSearch, placeholder: "Search this list" }, returnFocusTo: { current: table } }));
    await press(document.body, "/");
    const input = view.container.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    await press(input, "/");
    expect(onSearch).not.toHaveBeenCalled();
    await press(input, "Escape");
    expect(onSearch).toHaveBeenCalledWith("");
    await view.render(createElement(FilterBar, { options, value: "all", onChange: vi.fn(), search: { value: "", onChange: onSearch, placeholder: "Search this list" }, returnFocusTo: { current: table } }));
    await press(input, "Escape");
    expect(document.activeElement).toBe(table);
    await view.unmount();
  });

  it("echoes active filters as removable chips, removable with Backspace", async () => {
    const onRemove = vi.fn();
    const view = await mount(createElement(FilterBar, { options, value: "all", onChange: vi.fn(), echoes: [{ id: "m", label: "Money", onRemove }] }));
    const remove = buttonByText(view.container, "Remove filter Money");
    await click(remove);
    await press(remove, "Backspace");
    expect(onRemove).toHaveBeenCalledTimes(2);
    await view.unmount();
  });

  it("disables pills while loading, with counts as ellipses, and shows a retry on error", async () => {
    const view = await mount(createElement(FilterBar, { options, value: "all", onChange: vi.fn(), state: "loading" }));
    const pills = Array.from(view.container.querySelectorAll<HTMLButtonElement>("button"));
    expect(pills.every((p) => p.disabled)).toBe(true);
    expect(pills[0]?.textContent).toBe("All...");
    const onRetry = vi.fn();
    await view.render(createElement(FilterBar, { options, value: "all", onChange: vi.fn(), state: "error", onRetry }));
    expect(view.container.querySelector("[role='alert']")).not.toBeNull();
    await click(buttonByText(view.container, "Try again"));
    expect(onRetry).toHaveBeenCalled();
    await view.unmount();
  });
});

describe("InlineEdit", () => {
  it("shows an edit button, edits with the text selected, saves on Enter and returns focus to the value", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const view = await mount(createElement(InlineEdit, { label: "Owner name", value: "Asha", onSave }));
    await click(buttonByText(view.container, "Edit Owner name"));
    const input = view.container.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    await type(input, "Asha Rao");
    await press(input, "Enter");
    expect(onSave).toHaveBeenCalledWith("Asha Rao");
    await act(async () => undefined);
    expect(view.container.querySelector("input")).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Edit Owner name");
    await view.unmount();
  });

  it("cancels on Esc without saving and saves on blur", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const view = await mount(createElement(InlineEdit, { label: "Owner name", value: "Asha", onSave }));
    await click(buttonByText(view.container, "Edit Owner name"));
    await type(view.container.querySelector("input") as HTMLInputElement, "Changed");
    await press(view.container.querySelector("input") as HTMLElement, "Escape");
    expect(onSave).not.toHaveBeenCalled();
    await click(buttonByText(view.container, "Edit Owner name"));
    const input = view.container.querySelector("input") as HTMLInputElement;
    await type(input, "Blur value");
    await act(async () => {
      input.blur();
    });
    expect(onSave).toHaveBeenCalledWith("Blur value");
    await view.unmount();
  });

  it("keeps the typed value and focus when validation or the save fails", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: false, message: "Could not save. Try again." });
    const validate = (next: string): string | null => (next.startsWith("https://") ? null : "Start it with https://");
    const view = await mount(createElement(InlineEdit, { label: "Preview link", value: "https://a.test", onSave, validate, inputMode: "url" }));
    await click(buttonByText(view.container, "Edit Preview link"));
    const input = view.container.querySelector("input") as HTMLInputElement;
    await type(input, "preview.example");
    await press(input, "Enter");
    expect(onSave).not.toHaveBeenCalled();
    expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Start it with https://");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(input);
    await type(input, "https://b.test");
    await press(input, "Enter");
    await act(async () => undefined);
    expect(view.container.querySelector("[role='alert']")?.textContent).toContain("Could not save");
    expect((view.container.querySelector("input") as HTMLInputElement).value).toBe("https://b.test");
    expect(document.activeElement).toBe(view.container.querySelector("input"));
    await view.unmount();
  });

  it("saves a note with Ctrl Enter only, renders the empty label and read-only text", async () => {
    const onSave = vi.fn().mockResolvedValue({ ok: true });
    const view = await mount(createElement(InlineEdit, { label: "Internal note", value: "", emptyLabel: "Add a note only staff can see", multiline: true, onSave }));
    expect(view.container.textContent).toContain("Add a note only staff can see");
    await click(buttonByText(view.container, "Edit Internal note"));
    const area = view.container.querySelector("textarea") as HTMLTextAreaElement;
    await type(area, "Called back");
    await press(area, "Enter");
    expect(onSave).not.toHaveBeenCalled();
    await press(area, "Enter", { ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith("Called back");
    await view.unmount();
    const ro = await mount(createElement(InlineEdit, { label: "Business id", value: "0000-0000", onSave, readOnlyReason: "Set by the system." }));
    expect(ro.container.querySelector("button")).toBeNull();
    expect(ro.container.textContent).toContain("Set by the system.");
    await ro.unmount();
  });

  it("raises an Undo toast when the save returns an undo", async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const onSave = vi.fn().mockResolvedValue({ ok: true, undo });
    const view = await mount(createElement(InlineEdit, { label: "Owner name", value: "Asha", onSave }));
    await click(buttonByText(view.container, "Edit Owner name"));
    await type(view.container.querySelector("input") as HTMLInputElement, "Bina");
    await press(view.container.querySelector("input") as HTMLElement, "Enter");
    await act(async () => undefined);
    expect(toastStore.getAll()).toHaveLength(1);
    expect(toastStore.getAll()[0]?.undo).toBe(undo);
    await view.unmount();
  });
});

describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  const tick = (ms: number): Promise<void> =>
    act(async () => {
      vi.advanceTimersByTime(ms);
    });

  it("removes a plain toast after 4 seconds and an Undo toast after 10", async () => {
    const view = await mount(createElement(ToastRegion));
    await act(async () => {
      toastStore.show({ message: "Report sent" });
      toastStore.show({ message: "Marked contacted", undo: async () => undefined });
    });
    expect(view.container.textContent).toContain("Report sent");
    await tick(3999);
    expect(view.container.textContent).toContain("Report sent");
    await tick(2);
    expect(view.container.textContent).not.toContain("Report sent");
    await tick(5000);
    expect(view.container.textContent).toContain("Marked contacted");
    await tick(1100);
    expect(view.container.textContent).not.toContain("Marked contacted");
    await view.unmount();
  });

  it("keeps an error until it is dismissed and announces it assertively", async () => {
    const view = await mount(createElement(ToastRegion));
    await act(async () => {
      toastStore.show({ message: "Could not mark contacted. Nothing changed.", tone: "error", retry: vi.fn() });
    });
    await tick(60000);
    const alert = view.container.querySelector("[aria-live='assertive']") as HTMLElement;
    expect(alert.textContent).toContain("Could not mark contacted");
    expect(view.container.querySelector("[aria-live='polite']")?.textContent).toBe("");
    await click(buttonByText(view.container, "Dismiss"));
    expect(alert.textContent).toBe("");
    await view.unmount();
  });

  it("pauses the timer on hover and resumes on leave", async () => {
    const view = await mount(createElement(ToastRegion));
    await act(async () => {
      toastStore.show({ message: "Closed request", undo: async () => undefined });
    });
    const toast = view.container.querySelector("[aria-live='polite'] > div") as HTMLElement;
    await tick(5000);
    await act(async () => {
      toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await tick(30000);
    expect(view.container.textContent).toContain("Closed request");
    await act(async () => {
      toast.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    await tick(4900);
    expect(view.container.textContent).toContain("Closed request");
    await tick(200);
    expect(view.container.textContent).not.toContain("Closed request");
    await view.unmount();
  });

  it("runs Undo, then shows a plain confirming toast with no Undo of its own", async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const view = await mount(createElement(ToastRegion));
    await act(async () => {
      toastStore.show({ message: "Closed request", undo });
    });
    await click(buttonByText(view.container, "Undo"));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toastStore.getAll().map((t) => t.message)).toEqual(["Undone"]);
    expect(toastStore.getAll()[0]?.undo).toBeUndefined();
    await view.unmount();
  });

  it("shows an error toast when Undo fails and offers Undo with the u key only while one is visible", async () => {
    const undo = vi.fn().mockRejectedValue(new Error("changed"));
    const view = await mount(createElement(ToastRegion));
    await press(document.body, "u");
    expect(undo).not.toHaveBeenCalled();
    await act(async () => {
      toastStore.show({ message: "Closed request", undo });
    });
    await press(document.body, "u");
    expect(undo).toHaveBeenCalledTimes(1);
    expect(toastStore.getAll()[0]?.tone).toBe("error");
    await view.unmount();
  });

  it("shows at most three toasts and counts the rest", async () => {
    const view = await mount(createElement(ToastRegion));
    await act(async () => {
      for (const n of [1, 2, 3, 4, 5]) toastStore.show({ message: `Toast ${n}`, durationMs: 60000 });
    });
    expect(view.container.textContent).toContain("Toast 5");
    expect(view.container.textContent).not.toContain("Toast 1");
    expect(view.container.textContent).toContain("and 2 more");
    await view.unmount();
  });
});

describe("BulkBar", () => {
  const action = (over: Partial<BulkAction> = {}): BulkAction => ({
    id: "contact",
    label: "Mark contacted",
    run: vi.fn().mockResolvedValue({ done: 3, failed: [] }),
    doneMessage: (n) => `Marked ${n} contacted`,
    ...over,
  });

  it("renders nothing without a selection and the count with it", async () => {
    const empty = await mount(createElement(BulkBar, { ids: [], actions: [action()], onClear: vi.fn() }));
    expect(empty.container.innerHTML).toBe("");
    await empty.unmount();
    const view = await mount(createElement(BulkBar, { ids: ["a", "b", "c"], actions: [action()], onClear: vi.fn() }));
    expect(view.container.querySelector("[role='region']")?.textContent).toContain("3 selected");
    await view.unmount();
  });

  it("runs a reversible action at once and shows one Undo toast that restores every row", async () => {
    const undo = vi.fn().mockResolvedValue(undefined);
    const onSettled = vi.fn();
    const act1 = action({ undo });
    const view = await mount(createElement(BulkBar, { ids: ["a", "b", "c"], actions: [act1], onClear: vi.fn(), onSettled }));
    await click(buttonByText(view.container, "Mark contacted"));
    expect(act1.run).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(onSettled).toHaveBeenCalledWith([]);
    const toast = toastStore.getAll()[0];
    expect(toast?.message).toBe("Marked 3 contacted");
    await toast?.undo?.();
    expect(undo).toHaveBeenCalledWith(["a", "b", "c"]);
    await view.unmount();
  });

  it("asks first when the action emails customers, with the count, and runs only after the confirm", async () => {
    const send = action({ id: "send", label: "Send setup link", confirm: (n) => ({ title: `Send ${n} setup links?`, consequence: "It emails each owner.", confirmLabel: `Send ${n} links` }) });
    const view = await mount(createElement(BulkBar, { ids: ["a", "b", "c"], actions: [send], onClear: vi.fn() }));
    await click(buttonByText(view.container, "Send setup link"));
    expect(send.run).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")?.textContent).toContain("Send 3 setup links?");
    await click(buttonByText(document.body, "Send 3 links"));
    expect(send.run).toHaveBeenCalledTimes(1);
    expect(toastStore.getAll()[0]?.undo).toBeUndefined();
    await view.unmount();
  });

  it("states a partial failure with numbers and reports the failed ids so they stay selected", async () => {
    const partial = action({ run: vi.fn().mockResolvedValue({ done: 2, failed: ["c"] }), partialMessage: (d, t, f) => `${d} of ${t} marked contacted, ${f} failed` });
    const onSettled = vi.fn();
    const view = await mount(createElement(BulkBar, { ids: ["a", "b", "c"], actions: [partial], onClear: vi.fn(), onSettled }));
    await click(buttonByText(view.container, "Mark contacted"));
    expect(view.container.querySelector("[role='alert']")?.textContent).toContain("2 of 3 marked contacted, 1 failed");
    expect(onSettled).toHaveBeenCalledWith(["c"]);
    expect(toastStore.getAll()).toHaveLength(0);
    await view.unmount();
  });

  it("keeps a disabled action visible with its reason and does not run it", async () => {
    const close = action({ id: "close", label: "Close selected", disabledReason: () => "Close needs requests only." });
    const view = await mount(createElement(BulkBar, { ids: ["a"], actions: [close], onClear: vi.fn() }));
    expect(view.container.textContent).toContain("Close needs requests only.");
    const button = buttonByText(view.container, "Close selected");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    await click(button);
    expect(close.run).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("locks every control while an action runs and clears on Clear", async () => {
    let finish: (v: { done: number; failed: string[] }) => void = () => undefined;
    const slow = action({ busyLabel: "Marking", run: () => new Promise((resolve) => (finish = resolve)) });
    const onClear = vi.fn();
    const view = await mount(createElement(BulkBar, { ids: ["a"], actions: [slow], onClear }));
    await click(buttonByText(view.container, "Mark contacted"));
    expect(view.container.querySelector("[role='region']")?.getAttribute("aria-busy")).toBe("true");
    expect(view.container.querySelectorAll<HTMLButtonElement>("button")[0]?.textContent).toBe("Marking...");
    expect(Array.from(view.container.querySelectorAll<HTMLButtonElement>("button")).every((b) => b.disabled)).toBe(true);
    await act(async () => finish({ done: 1, failed: [] }));
    await click(buttonByText(view.container, "Clear"));
    expect(onClear).toHaveBeenCalled();
    await view.unmount();
  });
});

describe("CommandBar", () => {
  const statics: readonly CommandItem[] = [
    { id: "today", group: "go", title: "Today", hint: "g t", href: "/" },
    { id: "money", group: "go", title: "Money", hint: "g m", href: "/money" },
    { id: "enq", group: "action", title: "Add enquiry", run: vi.fn() },
    { id: "refund", group: "action", title: "Refund", disabledReason: "Open from a payment", run: vi.fn() },
  ];
  const baseProps = { staticItems: statics, recent: [] as readonly CommandItem[], onOpenChange: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    baseProps.onOpenChange.mockClear();
  });

  it("toggles with Ctrl K from inside a field and renders nothing while closed", async () => {
    const onOpenChange = vi.fn();
    const view = await mount(createElement(CommandBar, { ...baseProps, onOpenChange, open: false, search: vi.fn() }));
    expect(document.querySelector("dialog")).toBeNull();
    const field = document.createElement("input");
    document.body.appendChild(field);
    await press(field, "k", { ctrlKey: true });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    await view.unmount();
  });

  it("opens as a combobox with Go to and Actions groups, wraps with the arrows and runs with Enter", async () => {
    const onNavigate = vi.fn();
    const onOpenChange = vi.fn();
    const view = await mount(createElement(CommandBar, { ...baseProps, onOpenChange, onNavigate, open: true, search: vi.fn() }));
    const input = document.querySelector("input") as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute("role")).toBe("combobox");
    expect(document.body.textContent).toContain("Go to");
    expect(document.body.textContent).toContain("Actions");
    const options = Array.from(document.querySelectorAll("[role='option']"));
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    await press(input, "ArrowUp");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[options.length - 1]?.id);
    await press(input, "ArrowDown");
    await press(input, "ArrowDown");
    await press(input, "Enter");
    expect(onNavigate).toHaveBeenCalledWith("/money", false);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await view.unmount();
  });

  it("opens in a new tab with Ctrl Enter and refuses a disabled item, showing its reason", async () => {
    const onNavigate = vi.fn();
    const view = await mount(createElement(CommandBar, { ...baseProps, onNavigate, open: true, search: vi.fn() }));
    const input = document.querySelector("input") as HTMLInputElement;
    await press(input, "Enter", { ctrlKey: true });
    expect(onNavigate).toHaveBeenCalledWith("/", true);
    await press(input, "ArrowUp");
    await press(input, "Enter");
    expect(statics[3]?.run).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Open from a payment");
    await view.unmount();
  });

  it("debounces the server search, marks the match and ignores a stale answer", async () => {
    const answers: Record<string, readonly CommandItem[]> = { bu: [{ id: "c1", group: "client", title: "Busy Bakery" }], bus: [{ id: "c2", group: "client", title: "Bus Depot" }] };
    const search = vi.fn((term: string) => Promise.resolve(answers[term] ?? []));
    const view = await mount(createElement(CommandBar, { ...baseProps, open: true, search }));
    const input = document.querySelector("input") as HTMLInputElement;
    await type(input, "bu");
    expect(search).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(search).toHaveBeenCalledWith("bu", "all");
    expect(document.body.textContent).toContain("Clients");
    expect(document.querySelector("mark")?.textContent).toBe("Bu");
    await type(input, "bus");
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(document.body.textContent).toContain("Bus Depot");
    expect(document.body.textContent).not.toContain("Busy Bakery");
    await view.unmount();
  });

  it("uses > for actions only and # for request references, and Backspace on empty leaves the mode", async () => {
    const search = vi.fn().mockResolvedValue([{ id: "r1", group: "request", title: "Request 1042" }]);
    const view = await mount(createElement(CommandBar, { ...baseProps, open: true, search }));
    const input = document.querySelector("input") as HTMLInputElement;
    await type(input, ">");
    expect(document.body.textContent).toContain("Add enquiry");
    expect(document.body.textContent).not.toContain("Money");
    await press(input, "Backspace");
    expect(document.body.textContent).toContain("Money");
    await type(input, "#");
    await type(input, "1042");
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(search).toHaveBeenCalledWith("1042", "requestRef");
    expect(document.body.textContent).toContain("Request 1042");
    await view.unmount();
  });

  it("clears the text on the first Esc, closes on the second and returns focus to the opener", async () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onOpenChange = vi.fn();
    const view = await mount(createElement(CommandBar, { ...baseProps, onOpenChange, open: true, search: vi.fn().mockResolvedValue([]) }));
    const input = document.querySelector("input") as HTMLInputElement;
    await type(input, "zz");
    await press(document, "Escape");
    expect(input.value).toBe("");
    expect(onOpenChange).not.toHaveBeenCalled();
    await press(document, "Escape");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    await view.render(createElement(CommandBar, { ...baseProps, onOpenChange, open: false, search: vi.fn() }));
    expect(document.activeElement).toBe(opener);
    await view.unmount();
  });

  it("shows an empty message and an error with Try again", async () => {
    const search = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("down")).mockResolvedValue([{ id: "c", group: "client", title: "Qzx Co" }]);
    const view = await mount(createElement(CommandBar, { ...baseProps, open: true, search }));
    const input = document.querySelector("input") as HTMLInputElement;
    await type(input, "qzx");
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(document.body.textContent).toContain('No results for "qzx".');
    await type(input, "qzxa");
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(document.querySelector("[role='alert']")?.textContent).toContain("Search did not load");
    await click(buttonByText(document.body, "Try again"));
    await act(async () => {
      vi.advanceTimersByTime(150);
    });
    expect(document.body.textContent).toContain("Qzx Co");
    await view.unmount();
  });

  it("asks first for an item with a confirm", async () => {
    const run = vi.fn();
    const items: readonly CommandItem[] = [{ id: "x", group: "action", title: "Send report", run, confirm: { title: "Send report?", consequence: "It emails the owner.", confirmLabel: "Send report" } }];
    const view = await mount(createElement(CommandBar, { ...baseProps, staticItems: items, open: true, search: vi.fn() }));
    await press(document.querySelector("input") as HTMLElement, "Enter");
    expect(run).not.toHaveBeenCalled();
    await click(buttonByText(document.body, "Send report"));
    expect(run).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});

describe("reduced motion", () => {
  const css = readFileSync(join(process.cwd(), "src/styles/theme.css"), "utf8");
  const customerCss = readFileSync(join(process.cwd(), "../../apps/customer/src/styles/globals.css"), "utf8");

  it("turns the entrance utilities off under prefers-reduced-motion in both apps", () => {
    for (const sheet of [css, customerCss]) {
      for (const name of ["motion-rise", "motion-pop"]) {
        const block = sheet.slice(sheet.indexOf(`@utility ${name}`));
        const end = block.indexOf("\n}\n");
        expect(block.slice(0, end)).toContain("prefers-reduced-motion: reduce");
      }
    }
  });

  it("uses the entrance utilities on toasts and overlays and removes the panel slide for reduced motion", async () => {
    stubMedia(false);
    await act(async () => {
      toastStore.show({ message: "Hello" });
    });
    const region = await mount(createElement(ToastRegion));
    expect(region.container.innerHTML).toContain("motion-rise");
    await region.unmount();
    const panel = await mount(createElement(SidePanel, { open: true, onClose: vi.fn(), title: "x", children: null }));
    expect(document.querySelector("aside")?.className).toContain("motion-reduce:transition-none");
    await panel.unmount();
    const menu = await mount(createElement(CommandBar, { open: true, onOpenChange: vi.fn(), staticItems: [], recent: [], search: vi.fn() }));
    expect(document.querySelector("dialog")?.innerHTML).toContain("motion-pop");
    await menu.unmount();
  });
});
