"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Banner, Button, type ButtonProps } from "@/ui";
import { cx } from "@/ui/cx";
import { startConnectAction } from "../actions";
import type { Platform } from "../../analytics/rules";

export interface ConnectButtonProps {
  readonly platform: Platform;
  readonly children: string;
  /** A mark drawn before the label, such as the network's logo. */
  readonly leading?: ReactNode;
  readonly className?: string;
  readonly variant?: ButtonProps["variant"];
  readonly size?: ButtonProps["size"];
}

/**
 * Sends the customer to a network's own Allow page. The action returns the address and this opens it, so the browser leaves this
 * app only after the posting service has made the link. A refusal is said under the button, in words, and nothing is opened.
 */
export function ConnectButton({ platform, children, leading, className, variant = "secondary", size = "md" }: ConnectButtonProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function connect() {
    setMessage(null);
    startTransition(async () => {
      const result = await startConnectAction(platform);
      if (result.ok && result.data !== undefined) {
        window.location.assign(result.data.url);
        return;
      }
      setMessage(result.ok ? "We could not start the connection. Try again." : result.message);
    });
  }

  return (
    <div className={cx("flex flex-col items-start gap-2", className !== undefined && "w-full items-stretch")}>
      <Button variant={variant} size={size} pending={pending} onClick={connect} className={className}>
        {leading}
        {children}
      </Button>
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
    </div>
  );
}
