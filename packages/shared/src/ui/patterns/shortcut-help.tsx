"use client";

import { useId, type ReactElement } from "react";
import { patternButtonSecondary } from "./button-classes";
import { ModalDialog } from "./modal-dialog";
import { formatKeys, type Shortcut, type ShortcutGroup } from "./use-shortcuts";

export interface ShortcutHelpProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The same registry the handlers read, so the help cannot drift from the keys. */
  readonly shortcuts: readonly Shortcut[];
}

const GROUPS: readonly ShortcutGroup[] = ["Lists", "Go to", "Anywhere"];

/** The `?` shortcut for the registry. Add it next to the others and pass the same list to ShortcutHelp. */
export function helpShortcut(onOpen: () => void): Shortcut {
  return { id: "shortcut-help", keys: "?", label: "Show keyboard shortcuts", group: "Anywhere", run: onOpen };
}

/** ShortcutHelp: a native dialog listing every shortcut that applies on the current screen, grouped Lists, Go to, Anywhere. */
export function ShortcutHelp({ open, onClose, shortcuts }: ShortcutHelpProps): ReactElement | null {
  const titleId = useId();
  if (!open) return null;
  const applicable = shortcuts.filter((shortcut) => shortcut.enabled !== false);

  return (
    <ModalDialog labelledBy={titleId} onEscape={onClose} onScrimClick={onClose} className="w-[640px]">
      <div className="motion-pop w-full rounded-[20px] bg-surface p-7 shadow-dialog">
        <h2 id={titleId} className="font-display text-[22px] font-semibold leading-7 text-ink">
          Keyboard shortcuts
        </h2>
        <div className="my-4 grid grid-cols-2 gap-x-8 gap-y-1 font-sans text-[13.5px] leading-5 max-[600px]:grid-cols-1">
          {GROUPS.map((group) => {
            const inGroup = applicable.filter((shortcut) => shortcut.group === group);
            if (inGroup.length === 0) return null;
            return (
              <section key={group} className="col-span-full mt-3 first:mt-0">
                <h3 className="mb-1 font-sans text-xs font-semibold leading-4 text-ink-2">{group}</h3>
                <ul className="grid grid-cols-2 gap-x-8 max-[600px]:grid-cols-1">
                  {inGroup.map((shortcut) => (
                    <li key={shortcut.id} className="flex items-center justify-between gap-3 border-b border-border py-1">
                      <span className="text-ink">{shortcut.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {formatKeys(shortcut.keys).map((chunk, index) => (
                          <span key={chunk} className="flex items-center gap-1">
                            {index > 0 ? <span className="text-xs text-ink-3">then</span> : null}
                            <kbd className="whitespace-nowrap rounded-[6px] border border-border bg-surface-hover px-1.5 font-mono text-xs text-ink">{chunk}</kbd>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={patternButtonSecondary}>
            Close
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
