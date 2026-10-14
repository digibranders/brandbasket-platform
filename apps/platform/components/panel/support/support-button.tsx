"use client";

import type { ReactElement } from "react";
import { useSupportLauncher } from "@firstfold/shared/ui/panel/support-context";

export function SupportButton(): ReactElement {
  const support = useSupportLauncher();
  return <button type="button" className="link-underline text-sm text-ink-soft cursor-pointer" onClick={(event) => support?.open("support", event.currentTarget)}>Get help</button>;
}
