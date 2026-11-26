"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Banner, Button } from "@/ui";
import { ChannelLogo } from "@/legacy-social/components/channel-logo";
import { cancelChannelRequestAction, requestChannelAction } from "../actions";
import type { Platform } from "../../analytics/rules";
import { CHANNEL_NAMES } from "../../analytics/rules";
import { requestWords, type ChannelRequest } from "../requests";
import { ConnectButton } from "./connect-button";

const ASK: Readonly<Record<"instagram" | "facebook", { readonly label: string; readonly hint: string; readonly example: string }>> = {
  instagram: { label: "Add your Instagram profile", hint: "A Business or Creator account", example: "instagram.com/yourname" },
  facebook: { label: "Add your Facebook page", hint: "A Page you manage", example: "facebook.com/yourpage" },
};

/**
 * A network that cannot be connected with its Allow button yet: the customer sends the link to her profile, our team sets it up with
 * her, and the row says where that stands. Once she is added she presses Allow here as for any network.
 */
export function RequestChannel({ platform, request, needsPerson = false }: { readonly platform: Platform; readonly request: ChannelRequest | null; /** Also ask for the personal Facebook profile of the person who manages the account. */ readonly needsPerson?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [person, setPerson] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const name = CHANNEL_NAMES[platform];
  const ask = platform === "instagram" || platform === "facebook" ? ASK[platform] : null;
  if (ask === null) return null;

  function send(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await requestChannelAction(platform, url, needsPerson ? person : undefined);
      if (!result.ok) return setMessage(result.message);
      setOpen(false);
      setUrl("");
      setPerson("");
      router.refresh();
    });
  }

  function cancel() {
    setMessage(null);
    startTransition(async () => {
      const result = await cancelChannelRequestAction(platform);
      if (!result.ok) return setMessage(result.message);
      router.refresh();
    });
  }

  const waiting = request !== null && (request.state === "requested" || request.state === "invited");
  const words = request === null ? null : requestWords(request);
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-2 pb-4">
      <div className="flex items-center gap-2.5">
        <ChannelLogo platform={platform} small />
        <span className="type-body font-medium text-ink">{name}</span>
      </div>
      {words === null ? <p className="type-meta">{ask.hint}</p> : <p className="type-meta">{words.long}</p>}
      {request?.state === "invited" ? <ConnectButton platform={platform} size="sm">{`Allow ${name}`}</ConnectButton> : null}
      {waiting ? (
        <Button variant="ghost" size="sm" pending={pending} onClick={cancel} className="h-auto! min-h-8 w-full min-w-0 justify-start whitespace-normal! py-1.5 text-left leading-tight">
          Send a different link
        </Button>
      ) : open ? (
        <form onSubmit={send} className="flex w-full flex-col gap-2">
          <label className="type-meta" htmlFor={`profile-link-${platform}`}>
            Paste the link, for example {ask.example}
          </label>
          <input id={`profile-link-${platform}`} value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" autoComplete="off" spellCheck={false} className="h-control w-full min-w-0 rounded-control border border-border-control bg-surface px-3 type-body" />
          {needsPerson ? (
            <>
              <label className="type-meta" htmlFor={`person-link-${platform}`}>
                Your own Facebook profile, the person who manages it, for example facebook.com/yourname
              </label>
              <input id={`person-link-${platform}`} value={person} onChange={(event) => setPerson(event.target.value)} inputMode="url" autoComplete="off" spellCheck={false} className="h-control w-full min-w-0 rounded-control border border-border-control bg-surface px-3 type-body" />
            </>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" pending={pending}>
              Send my link
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Not now
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="h-auto! min-h-8 w-full min-w-0 justify-start whitespace-normal! py-1.5 text-left leading-tight">
          {request?.state === "refused" ? "Send a new link" : ask.label}
        </Button>
      )}
      {message === null ? null : <Banner tone="neg">{message}</Banner>}
    </div>
  );
}
