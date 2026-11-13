import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/** A small happy-dom harness for the social components' tests: mount, find by visible text, click and type. Tests using it start with `// @vitest-environment happy-dom`. */
const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };

export interface Mounted {
  readonly container: HTMLElement;
  readonly render: (element: ReactElement) => Promise<void>;
  readonly unmount: () => void;
}

export function mount(): Mounted {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root: Root = createRoot(container);
  return {
    container,
    render: async (element) => {
      await act(async () => root.render(element));
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** The buttons whose text is exactly `name`. */
export const buttonsNamed = (container: ParentNode, name: string): HTMLButtonElement[] => [...container.querySelectorAll("button")].filter((button) => button.textContent === name);

export function button(container: ParentNode, name: string): HTMLButtonElement {
  const found = buttonsNamed(container, name)[0];
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
}

export const click = async (element: HTMLElement): Promise<void> => {
  await act(async () => element.click());
};

/** Sets a text field, textarea or select the way a person does, so React's onChange runs. */
export const type = async (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): Promise<void> => {
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) throw new Error("The field has no value setter");
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
};

/** Lets a pending server action settle and React re-render. */
export const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
  });
};
