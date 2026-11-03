import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Design system" };

/**
 * The primitives preview (plan 61, phase 2). Development only: a production build answers 404, so it needs no guard and
 * shows no customer data.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main id="page" className="mx-auto w-full max-w-page px-gutter py-5">
      <Showcase />
    </main>
  );
}
