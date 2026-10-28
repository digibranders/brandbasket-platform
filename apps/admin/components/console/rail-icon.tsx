import type { Icon } from "@phosphor-icons/react";
import {
  Bug,
  CalendarCheck,
  ChatText,
  CreditCard,
  GearSix,
  Handshake,
  Kanban,
  Megaphone,
  PlugsConnected,
  Receipt,
  ShieldCheck,
  Storefront,
  SunHorizon,
  Tag,
  Ticket,
  Tray,
  UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactElement } from "react";
import type { ConsoleRailIcon } from "@/lib/console-rail";

const ICONS: Readonly<Record<ConsoleRailIcon, Icon>> = {
  today: SunHorizon,
  leads: Tray,
  clients: Storefront,
  projects: Kanban,
  requests: ChatText,
  calls: CalendarCheck,
  payments: CreditCard,
  invoices: Receipt,
  prices: Tag,
  coupons: Ticket,
  affiliates: Handshake,
  "ad-credit": Megaphone,
  deliveries: PlugsConnected,
  errors: Bug,
  staff: UsersThree,
  settings: GearSix,
  compliance: ShieldCheck,
};

export function RailIconMark({ name, current }: { readonly name: ConsoleRailIcon; readonly current: boolean }): ReactElement {
  const Mark = ICONS[name];
  return <Mark size={18} weight={current ? "fill" : "regular"} aria-hidden="true" />;
}
