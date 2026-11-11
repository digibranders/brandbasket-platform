import Image from "next/image";
import type { ReactNode } from "react";
import { AuthArt } from "@/features/entry/components/auth-art";
import frame from "@/features/entry/components/auth-art.module.css";

/**
 * The entry frame for sign in, sign up and reset: the Pin drop panel on the left, the bB logo and the form on the right
 * (the panel is a short band above the form on phones). Owner's pick, docs/design/auth-v4-concepts.html, concept A.
 */
export default function AuthLayout({ children }: { readonly children: ReactNode }) {
  return (
    <main id="page" className={frame.frame}>
      <div className="flex flex-col px-4 py-6 md:px-12 md:py-8">
        <Image src="/brand/brandbasket-logo-horizontal-light.svg" alt="Brandbasket" width={166} height={28} priority unoptimized />
        <div className="flex flex-1 items-center py-8">
          <div className="flex w-full max-w-100 flex-col gap-4">{children}</div>
        </div>
      </div>
      <AuthArt />
    </main>
  );
}
