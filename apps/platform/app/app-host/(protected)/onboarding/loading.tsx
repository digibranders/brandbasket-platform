import type { ReactElement } from "react";
import { SkeletonPage } from "@fynix/shared/ui/panel/skeleton";

export default function Loading(): ReactElement {
  return <SkeletonPage sections={2} />;
}
