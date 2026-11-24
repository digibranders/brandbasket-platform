import type { Icon } from "@phosphor-icons/react";
import { CreditCard, GearSix, ShieldCheck, Storefront, SunHorizon, Tray } from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import type { ConsoleRailIcon } from "@/lib/console-rail";

const ICONS: Readonly<Record<ConsoleRailIcon, Icon>> = {
  today: SunHorizon,
  clients: Storefront,
  inbox: Tray,
  money: CreditCard,
  compliance: ShieldCheck,
  system: GearSix,
};

export function RailIconMark({ name, current }: { readonly name: ConsoleRailIcon; readonly current: boolean }): ReactElement {
  const Mark = ICONS[name];
  return <Mark size={18} weight={current ? "fill" : "regular"} aria-hidden="true" />;
}
