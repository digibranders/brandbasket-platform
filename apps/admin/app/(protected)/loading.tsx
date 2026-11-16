import type { ReactElement } from "react";
import { ListSkeleton } from "@/components/console/route-states";

/** Every console screen without a closer loading.tsx: the console frame stays and a header, figures and rows hold the place. */
export default function Loading(): ReactElement {
  return <ListSkeleton label="Loading" />;
}
