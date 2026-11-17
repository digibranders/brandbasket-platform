"use client";

import { useState, useTransition } from "react";
import { Banner, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui";
import { setNotificationAction } from "../actions";
import type { NotificationRow } from "../rules/notifications";

const CHANNELS = [
  { key: "bell", label: "Bell" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
] as const;
type Channel = (typeof CHANNELS)[number]["key"];

/**
 * Settings, Notifications: one switch per topic on the bell, email and push, applied the moment it is flipped. What cannot be
 * switched off is listed underneath as "Always sent". The WhatsApp column waits for gate G3. A switch that could not be saved
 * goes back and says so.
 */
export function NotificationTable({ rows, always }: { readonly rows: readonly NotificationRow[]; readonly always: readonly string[] }) {
  const [choices, setChoices] = useState<Readonly<Record<string, boolean>>>(() =>
    Object.fromEntries(rows.flatMap((row) => CHANNELS.map((channel) => [`${row.topic}:${channel.key}`, row[channel.key]]))),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function change(topic: string, channel: Channel, enabled: boolean): void {
    const key = `${topic}:${channel}`;
    const before = choices[key] ?? false;
    setMessage(null);
    setChoices((previous) => ({ ...previous, [key]: enabled }));
    startTransition(async () => {
      const result = await setNotificationAction(topic, channel, enabled);
      if (result.ok) return;
      setChoices((previous) => ({ ...previous, [key]: before }));
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
      <Table aria-label="Notifications">
        <TableHead>
          <TableHeader>Tell me when</TableHeader>
          {CHANNELS.map((channel) => (
            <TableHeader key={channel.key} align="end">
              {channel.label}
            </TableHeader>
          ))}
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.topic}>
              <TableCell className="type-sub">{row.label}</TableCell>
              {CHANNELS.map((channel) => (
                <TableCell key={channel.key} align="end">
                  <Switch
                    label={`${row.label}: ${channel.key}`}
                    hideLabel
                    checked={choices[`${row.topic}:${channel.key}`] ?? false}
                    onCheckedChange={(next) => change(row.topic, channel.key, next)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
          {always.map((line) => (
            <TableRow key={line}>
              <TableCell className="type-sub">{line}</TableCell>
              <TableCell colSpan={CHANNELS.length} align="end" className="type-meta">
                Always sent
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
