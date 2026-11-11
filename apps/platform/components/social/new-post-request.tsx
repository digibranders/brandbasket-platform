"use client";

import { Plus } from "@phosphor-icons/react/dist/ssr";
import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { SMALL_ACCENT } from "./small-buttons";

interface NewPostRequests {
  /** How many times New post has been pressed; the calendar opens its window each time this goes up. */
  readonly count: number;
  readonly request: () => void;
}

const RequestContext = createContext<NewPostRequests | null>(null);

/** Lets New post, in the page's top corner, open the calendar's new-post window, which lives further down the page. */
export function NewPostRequestProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [count, setCount] = useState(0);
  const request = useCallback((): void => setCount((value) => value + 1), []);
  const value = useMemo(() => ({ count, request }), [count, request]);
  return <RequestContext value={value}>{children}</RequestContext>;
}

export function useNewPostRequests(): NewPostRequests {
  const value = useContext(RequestContext);
  if (value === null) throw new Error("useNewPostRequests must be used inside NewPostRequestProvider");
  return value;
}

/** The New post button, in the page's top right: in the brand's accent colour, so it stands apart from the quiet buttons around it. */
export function NewPostButton(): ReactElement {
  const { request } = useNewPostRequests();
  return (
    <button type="button" onClick={request} className={SMALL_ACCENT}>
      <Plus size={14} weight="bold" aria-hidden="true" />
      New post
    </button>
  );
}
