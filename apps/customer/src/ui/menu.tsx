"use client";

import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { ReactElement, ReactNode } from "react";
import { OPTION, POPUP } from "./control-styles";
import { cx } from "./cx";
import { Icon, type IconName } from "./icon";

export interface MenuProps {
  /** The button that opens the menu, usually an IconButton or Button. */
  readonly trigger: ReactElement<Record<string, unknown>>;
  readonly align?: "start" | "end";
  /** MenuItem, MenuSeparator and MenuLabel. One level only. */
  readonly children: ReactNode;
}

/** A list of actions on a button: 32px rows, arrow keys, typeahead, Escape closes and focus returns. */
export function Menu({ trigger, align = "start", children }: MenuProps) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner sideOffset={6} align={align} className="z-50">
          <BaseMenu.Popup className={cx(POPUP, "min-w-56")}>{children}</BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  );
}

export interface MenuItemProps {
  readonly icon?: IconName;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  /** Destructive items say so in their colour as well as their words. */
  readonly tone?: "default" | "danger";
  readonly children: ReactNode;
}

export function MenuItem({ icon, onClick, disabled, tone = "default", children }: MenuItemProps) {
  return (
    <BaseMenu.Item onClick={onClick} disabled={disabled} className={cx(OPTION, tone === "danger" && "text-neg-text")}>
      {icon === undefined ? null : <Icon name={icon} size="sm" />}
      {children}
    </BaseMenu.Item>
  );
}

/** A menu item that goes somewhere. */
export function MenuLinkItem({ href, icon, children }: { readonly href: string; readonly icon?: IconName; readonly children: ReactNode }) {
  return (
    <BaseMenu.LinkItem href={href} className={cx(OPTION, "no-underline")}>
      {icon === undefined ? null : <Icon name={icon} size="sm" />}
      {children}
    </BaseMenu.LinkItem>
  );
}

export function MenuSeparator() {
  return <BaseMenu.Separator className="my-1 border-t border-border-subtle" />;
}

/** A heading for a group of items, such as the signed-in person's name. */
export function MenuLabel({ children }: { readonly children: ReactNode }) {
  return <div className="px-2.5 py-2 type-meta">{children}</div>;
}
