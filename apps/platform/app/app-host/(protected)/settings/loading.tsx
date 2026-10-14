import type { ReactElement } from "react";
import { SkeletonPage } from "@firstfold/shared/ui/panel/skeleton";

export default function Loading(): ReactElement {
  return <SkeletonPage sections={3} />;
}
