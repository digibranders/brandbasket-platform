/** DOM helpers for the interaction tests (happy-dom). Not exported from the package index. */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  readonly container: HTMLElement;
  readonly root: Root;
  render: (element: ReactElement) => Promise<void>;
  unmount: () => Promise<void>;
}

export async function mount(element: ReactElement): Promise<Mounted> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    root,
    render: async (next) => {
      await act(async () => {
        root.render(next);
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

export async function press(target: Element | Document, key: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

export async function click(target: Element): Promise<void> {
  await act(async () => {
    (target as HTMLElement).click();
  });
}

export async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

export function byRole(root: ParentNode, role: string, name?: string): HTMLElement | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>(`[role='${role}']`));
  return all.find((el) => name === undefined || el.getAttribute("aria-label") === name || el.textContent?.trim() === name) ?? null;
}

export function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === text || b.getAttribute("aria-label") === text);
  if (!found) throw new Error(`No button named "${text}"`);
  return found;
}
