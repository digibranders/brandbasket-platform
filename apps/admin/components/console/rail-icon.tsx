import type { Icon } from "@phosphor-icons/react";
import { CalendarCheck, CreditCard, GearSix, Megaphone, Storefront, SunHorizon, Tray, UsersThree } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import type { ConsoleRailIcon } from "@/lib/console-rail";

const ICONS: Readonly<Record<ConsoleRailIcon, Icon>> = {
  today: SunHorizon,
  clients: Storefront,
  inbox: Tray,
  calls: CalendarCheck,
  money: CreditCard,
  ads: Megaphone,
  team: UsersThree,
  settings: GearSix,
};

export function RailIconMark({ name, current }: { readonly name: ConsoleRailIcon; readonly current: boolean }): ReactElement {
  const Mark = ICONS[name];
  return <Mark size={18} weight={current ? "fill" : "regular"} aria-hidden="true" />;
}
