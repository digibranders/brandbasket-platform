"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/ui";
import { signOutAction } from "../actions";
import { SHELL_PATHS } from "../rules";

export interface AccountMenuProps {
  /** The button that opens it: the person's row in the sidebar, or the account icon on phones. */
  readonly trigger: ReactElement<Record<string, unknown>>;
  readonly name: string;
  readonly contact: string;
  readonly align?: "start" | "end";
  /** Called with what to tell the person when signing out failed. */
  readonly onSignOutError: (message: string) => void;
}

/** The person's menu (mock: Your profile, Sign-in and security, Help and calls, Sign out; PARITY: What's new). */
export function AccountMenu({ trigger, name, contact, align = "start", onSignOutError }: AccountMenuProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const go = (href: string) => () => router.push(href);
  const signOut = () =>
    startTransition(async () => {
      const result = await signOutAction();
      if (!result.ok) onSignOutError(result.message);
    });
  return (
    <Menu trigger={trigger} align={align}>
      <MenuLabel>
        <span className="block type-sub text-ink">{name}</span>
        <span className="block truncate">{contact}</span>
      </MenuLabel>
      <MenuSeparator />
      <MenuItem icon="UserCircle" onClick={go(SHELL_PATHS.settings)}>
        Your profile
      </MenuItem>
      <MenuItem icon="Lock" onClick={go(SHELL_PATHS.security)}>
        Sign-in and security
      </MenuItem>
      <MenuItem icon="Lightning" onClick={go(SHELL_PATHS.changelog)}>
        What’s new
      </MenuItem>
      <MenuItem icon="Question" onClick={go(SHELL_PATHS.help)}>
        Help and calls
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon="SignOut" onClick={signOut}>
        Sign out
      </MenuItem>
    </Menu>
  );
}
