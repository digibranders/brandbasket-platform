"use client";

import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentPropsWithRef } from "react";
import { CONTROL } from "./control-styles";
import { cx } from "./cx";

export type InputProps = Omit<ComponentPropsWithRef<typeof BaseInput>, "className"> & { readonly className?: string };

/** A text input. Inside a Field it takes the label, hint and error from it. */
export function Input({ className, ...rest }: InputProps) {
  return <BaseInput {...rest} className={cx(CONTROL, "h-control px-3", className)} />;
}
