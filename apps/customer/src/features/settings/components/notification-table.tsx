"use client";

import { useState, useTransition } from "react";
import { Banner, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { setNotificationAction } from "../actions";
import type { NotificationRow } from "../rules/notifications";

/**
 * Settings, Notifications: one switch per kind of email, applied the moment it is flipped. Email only; the WhatsApp column
 * waits for gate G3. A switch that could not be saved goes back and says so.
 */
export function NotificationTable({ rows }: { readonly rows: readonly NotificationRow[] }) {
  const [choices, setChoices] = useState<Readonly<Record<string, boolean>>>(() => Object.fromEntries(rows.map((row) => [row.topic, row.email])));
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function change(topic: string, email: boolean): void {
    const before = choices[topic] ?? false;
    setMessage(null);
    setChoices((previous) => ({ ...previous, [topic]: email }));
    startTransition(async () => {
      const result = await setNotificationAction(topic, email);
      if (result.ok) return;
      setChoices((previous) => ({ ...previous, [topic]: before }));
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
      <Table aria-label="Email notifications">
        <TableHead>
          <TableHeader>Tell me when</TableHeader>
          <TableHeader align="end">Email</TableHeader>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.topic}>
              <TableCell className="type-sub">{row.label}</TableCell>
              <TableCell align="end">
                <Switch label={`${row.label}: email`} hideLabel checked={choices[row.topic] ?? false} onCheckedChange={(next) => change(row.topic, next)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
