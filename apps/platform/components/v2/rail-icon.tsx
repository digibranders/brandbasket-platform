import type { Icon } from "@phosphor-icons/react";
import { CheckSquare, ChatText, GearSix, GlobeSimple, MagnifyingGlass, Megaphone, Receipt, Robot, SquaresFour, Stack, Storefront } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import type { RailIcon } from "@/lib/rail";

const ICONS: Readonly<Record<RailIcon, Icon>> = {
  overview: SquaresFour,
  requests: ChatText,
  todo: CheckSquare,
  website: GlobeSimple,
  chatbot: Robot,
  social: Megaphone,
  search: MagnifyingGlass,
  profile: Storefront,
  services: Stack,
  billing: Receipt,
  settings: GearSix,
};

export function RailIconMark({ name, current }: { readonly name: RailIcon; readonly current: boolean }): ReactElement {
  const Mark = ICONS[name];
  return <Mark size={18} weight={current ? "fill" : "regular"} aria-hidden="true" />;
}
