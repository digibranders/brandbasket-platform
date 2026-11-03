import type { ReactNode } from "react";
import { Panel, PanelData } from "@/components";
import { CookieSettingsButton } from "@/features/consent/components/cookie-settings-button";
import { MEASUREMENT_TOOLS } from "@/features/consent/consent";
import type { Loaded } from "@/lib/loaded";
import { LinkButton } from "@/ui";
import type { NomineeView } from "../loader";
import { ACCOUNT_CLOSURE_GRACE_DAYS } from "../rules/account-closure-grace";
import { DELETE_ACCOUNT_PATH } from "../rules/account-settings-form";
import { PRIVACY_EXPORT_PATH, privacyRequestHref } from "../rules/privacy";
import { NomineeDialog } from "./nominee-dialog";

function Row({ title, text, action }: { readonly title: string; readonly text: ReactNode; readonly action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-4 py-3 last:border-b-0">
      <div className="min-w-60 flex-1">
        <p className="type-sub">{title}</p>
        <p className="type-meta">{text}</p>
      </div>
      {action}
    </div>
  );
}

export interface PrivacyPanelsProps {
  readonly nominee: Loaded<NomineeView | null>;
  /** Whether a Tag Manager container is set up here: without one no tool measures anything and nothing is asked. */
  readonly measuring: boolean;
  /** Closing the account ends the whole business's plan, so only the owner is offered it. */
  readonly canDelete: boolean;
}

/**
 * Settings, Privacy and data: a copy of the data, the nominee, the measurement choice, how to ask us to correct or delete
 * something, and (for the owner) closing the account. Open to every member of a business.
 */
export function PrivacyPanels({ nominee, measuring, canDelete }: PrivacyPanelsProps) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Your data" flush>
        <Row
          title="Download your data"
          text="A copy of your account, your business’s details, what you have been billed, your requests, where you signed in from and who we share your data with, as one file. It does not include your password."
          action={
            <LinkButton href={PRIVACY_EXPORT_PATH} prefetch={false} download size="sm" icon="DownloadSimple">
              Download
            </LinkButton>
          }
        />
      </Panel>

      <PanelData title="Nominee" data={nominee} what="your nominee" flush>
        {(current) => (
          <Row
            title="Someone who can act for you"
            text={current === null ? "Someone who can take over the account if you cannot." : `${current.name}, ${current.phoneText}`}
            action={<NomineeDialog current={current} />}
          />
        )}
      </PanelData>

      {measuring ? (
        <Panel title="Measuring how you use the dashboard" flush>
          <Row
            title="Your choice"
            text={`With your yes, ${MEASUREMENT_TOOLS.join(" and ")} count visits and record how pages are used. You can turn this on or off at any time.`}
            action={<CookieSettingsButton />}
          />
        </Panel>
      ) : null}

      <Panel title="Correct, delete or complain" flush>
        <Row
          title="Send us a privacy request"
          text="To correct something, have your data deleted, or make a complaint, email us. We reply within 30 days."
          action={
            <LinkButton href={privacyRequestHref()} size="sm" icon="EnvelopeSimple">
              Make a privacy request
            </LinkButton>
          }
        />
      </Panel>

      {canDelete ? (
        <Panel title="Delete account">
          <p className="type-body text-ink-2">This removes your account and stops every service. You have {ACCOUNT_CLOSURE_GRACE_DAYS} days to change your mind.</p>
          <div className="mt-3">
            <LinkButton href={DELETE_ACCOUNT_PATH} variant="danger">
              Delete my account
            </LinkButton>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
