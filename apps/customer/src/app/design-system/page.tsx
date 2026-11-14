import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ComponentsShowcase } from "./components-showcase";
import { PatternsShowcase } from "./patterns-showcase";
import { Showcase } from "./showcase";

export const metadata: Metadata = { title: "Design system" };

/**
 * The primitives, patterns, and application components preview.
 */
export default function DesignSystemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main id="page" className="mx-auto w-full max-w-page px-gutter py-5">
      <div className="flex flex-col gap-12">
        <PatternsShowcase />
        <Showcase />
        <ComponentsShowcase />
      </div>
    </main>
  );
}
