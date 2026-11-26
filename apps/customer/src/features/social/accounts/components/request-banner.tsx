import { CHANNEL_NAMES } from "../../analytics/rules";
import type { ChannelRequest } from "../requests";
import { ConnectButton } from "./connect-button";

/**
 * What waits on the customer for her Instagram and Facebook profile links, said at the top of the Social page so she does not have to look
 * for it: when she is invited, the steps and the Allow button; when the team could not set the account up, why and how to send a new link.
 * Nothing is shown while the team is still reviewing or once the account is connected.
 */
export function RequestBanner({ requests }: { readonly requests: readonly ChannelRequest[] }) {
  const open = requests.filter((request) => request.state === "invited" || request.state === "refused");
  if (open.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {open.map((request) => {
        const name = CHANNEL_NAMES[request.network];
        return request.state === "invited" ? (
          <section key={request.network} aria-label={`${name} is ready to connect`} className="rounded-xl bg-warn-wash px-4 py-3">
            <h2 className="type-section text-warn">Your {name} is ready to connect</h2>
            <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-ink">
              {request.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <div className="mt-3 max-w-xs">
              <ConnectButton platform={request.network} size="sm">{`Allow ${name}`}</ConnectButton>
            </div>
          </section>
        ) : (
          <section key={request.network} aria-label={`We could not set up your ${name}`} className="rounded-xl bg-warn-wash px-4 py-3">
            <h2 className="type-section text-warn">We could not set up your {name}</h2>
            <p className="mt-1 text-sm text-ink">{request.reason ?? "Check the link and send it again."}</p>
            <p className="mt-1 text-sm text-ink-2">Use Send a new link under Channels on the left.</p>
          </section>
        );
      })}
    </div>
  );
}
