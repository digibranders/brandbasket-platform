import type { ReactElement } from "react";
import { SkeletonPage } from "@brandbasket/shared/ui/panel/skeleton";

/** Home reads the project, billing, the live site and the blog before it can render a figure. */
export default function Loading(): ReactElement {
  return <SkeletonPage stats sections={1} />;
}
