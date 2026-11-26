import type { ReactNode } from "react";
import { AuthFrame } from "@/features/entry/components/auth-frame";

/** The entry frame for sign in and reset (see AuthFrame). Sign up draws its own: its checkout is wider than the frame. */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return <AuthFrame>{children}</AuthFrame>;
}
