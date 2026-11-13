"use client";

import { Field as BaseField } from "@base-ui/react/field";
import type { ComponentPropsWithRef } from "react";
import { CONTROL, controlWidth } from "./control-styles";
import { cx } from "./cx";

export interface TextareaProps extends Omit<ComponentPropsWithRef<"textarea">, "className"> {
  readonly className?: string;
}

/** A multi-line input, 96px tall to start, resizable. Inside a Field it takes the label, hint and error from it. */
export function Textarea({ className, ...rest }: TextareaProps) {
  return <BaseField.Control render={<textarea {...rest} />} className={cx(CONTROL, controlWidth(className), "min-h-24 resize-y px-3 py-2.5", className)} />;
}
