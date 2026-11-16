import type { ReactElement } from "react";
import { ListSkeleton } from "@/components/console/route-states";

export default function Loading(): ReactElement {
  return <ListSkeleton label="Loading staff" />;
}
