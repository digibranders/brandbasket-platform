import type { Icon } from "@phosphor-icons/react";
import { Article, ChatText, CreditCard, GearSix, GlobeSimple, Handshake, House, MapPin, Megaphone, Storefront } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import type { RailIcon } from "@/lib/rail";

const ICONS: Readonly<Record<RailIcon, Icon>> = {
  home: House,
  requests: ChatText,
  website: GlobeSimple,
  blog: Article,
  social: Megaphone,
  search: MapPin,
  business: Storefront,
  plan: CreditCard,
  settings: GearSix,
  affiliate: Handshake,
};

/** One sidebar icon, 20px; the current page's is filled. */
export function RailIconMark({ name, current }: { readonly name: RailIcon; readonly current: boolean }): ReactElement {
  const Mark = ICONS[name];
  return <Mark size={20} weight={current ? "fill" : "regular"} aria-hidden="true" className="shrink-0" />;
}
