import type { Icon } from "@phosphor-icons/react";
import { CheckSquare, ChatText, GearSix, GlobeSimple, Handshake, MagnifyingGlass, Megaphone, Receipt, SquaresFour, Stack, Storefront } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import { cn } from "@brandbasket/shared/lib/cn";
import type { RailIcon } from "@/lib/rail";

const ICONS: Readonly<Record<Exclude<RailIcon, "chatbot">, Icon>> = {
  overview: SquaresFour,
  requests: ChatText,
  todo: CheckSquare,
  website: GlobeSimple,
  social: Megaphone,
  search: MagnifyingGlass,
  profile: Storefront,
  services: Stack,
  billing: Receipt,
  settings: GearSix,
  affiliate: Handshake,
};

/**
 * One rail icon, 18px. OyeChats shows its own mark as its maker publishes it (public/brand), the white one on the dark rail and
 * the dark one on the light phone bars; it dims when not current, like the line icons beside it, whose weight changes instead.
 */
export function RailIconMark({ name, current, onDark = false }: { readonly name: RailIcon; readonly current: boolean; readonly onDark?: boolean }): ReactElement {
  if (name === "chatbot") {
    // A plain img: it is a small fixed picture, which next/image would only add work to.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={onDark ? "/brand/oyechats-icon-white.png" : "/brand/oyechats-icon.png"} alt="" width={18} height={18} aria-hidden="true" className={cn("size-[1.125rem] shrink-0 object-contain", !current && "opacity-75")} />;
  }
  const Mark = ICONS[name];
  return <Mark size={18} weight={current ? "fill" : "regular"} aria-hidden="true" />;
}
