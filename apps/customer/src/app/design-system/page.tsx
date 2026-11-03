import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComponentsShowcase } from "./components-showcase";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Design system" };

/**
 * The primitives and application components preview (plan 61, phase 2). Development only: a production build answers 404, so it needs no guard and
 * shows no customer data.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main id="page" className="mx-auto w-full max-w-page px-gutter py-5">
      <div className="flex flex-col gap-12">
        <Showcase />
        <ComponentsShowcase />
      </div>
    </main>
  );
}
