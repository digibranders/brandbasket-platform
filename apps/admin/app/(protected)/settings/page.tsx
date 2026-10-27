import type { Metadata } from "next";
import type { ReactElement } from "react";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { staffCan } from "@brandbasket/shared/lib/access";
import { MAX_SETUP_CALL_URL_LENGTH, SETUP_CALL_URL_FIELD } from "@brandbasket/shared/lib/setup-call-link";
import { MAX_TEAMS_URL_LENGTH, TEAMS_DESTINATION_FIELD, TEAMS_DESTINATION_INFO, TEAMS_DESTINATIONS, TEAMS_URL_FIELD } from "@brandbasket/shared/lib/teams-webhook";
import { buttonDanger, buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { SecretInput } from "@/components/console/secret-input";
import { PageHeader } from "@/components/console/page-header";
import { Quiet, Section } from "@/components/console/section";
import { findLatestWebsiteLeadAt } from "@brandbasket/db";
import { getStaffDb } from "@/lib/server/db";
import { readSettingsNotice, SETTINGS_NOTICES } from "@/lib/settings-notices";
import { loadSetupCallSetting } from "@/lib/server/settings-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { loadTeamsStates } from "@/lib/server/teams-admin";
import { removeTeamsWebhookAction, saveSetupCallUrlAction, saveTeamsWebhookAction, testTeamsWebhookAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

/** What staff can change without a developer: where the Book a call button on the dashboard goes, and where alerts are sent. */
export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  const { staff } = await requireStaffAccess();
  const canSetAlerts = staffCan(staff.role, "integrations");
  const [setting, params, teams, latestWebsiteLead] = await Promise.all([
    loadSetupCallSetting(),
    searchParams,
    canSetAlerts ? loadTeamsStates() : null,
    findLatestWebsiteLeadAt(getStaffDb()),
  ]);
  const notice = readSettingsNotice(params.saved);

  return (
    <>
      <PageHeader title={<>Settings</>} meta="Changes here are live straight away, with no deploy." />
      {notice === null ? null : (
        <Notice tone={SETTINGS_NOTICES[notice].ok ? "ok" : "problem"} className="mt-8">
          {SETTINGS_NOTICES[notice].text}
        </Notice>
      )}

      <Section id="setup-call" title="Setup call" aside={setting.url === null ? "Not set" : "Shown to customers"}>
        <form action={saveSetupCallUrlAction} className="max-w-2xl">
          <label htmlFor="setup-call-url" className={labelClasses}>
            Link to book a call
          </label>
          <input
            id="setup-call-url"
            name={SETUP_CALL_URL_FIELD}
            type="url"
            inputMode="url"
            maxLength={MAX_SETUP_CALL_URL_LENGTH}
            defaultValue={setting.url ?? ""}
            placeholder="https://calendly.com/your-team/setup-call"
            autoComplete="off"
            spellCheck={false}
            className={fieldClasses}
          />
          <p className={hintClasses}>
            Shown as a Book a call button on the Set up your website page, until a customer has sent their setup. Use your team’s
            booking page, not one tied to a single person. Leave it empty to hide the button.
          </p>
          <GatedSubmitButton className={`${buttonPrimary} mt-5`} pendingLabel="Saving…">
            Save link
          </GatedSubmitButton>
        </form>
        {setting.url === null ? (
          <Quiet>No link is set, so customers see no call card.</Quiet>
        ) : (
          <p className="mt-6 text-sm text-ink-soft">
            <a href={setting.url} target="_blank" rel="noopener noreferrer" className="link-underline">
              Open the link to check it
            </a>
            {setting.changedAt === null ? null : (
              <>
                {" "}
                · Last changed {setting.changedBy === null ? "" : `by ${setting.changedBy} `}on <LocalDateTime iso={setting.changedAt.toISOString()} variant="timestamp" />
              </>
            )}
          </p>
        )}
      </Section>

      <Section id="website-form" title="Website form" aside={latestWebsiteLead === null ? "Nothing received yet" : "Reaching us"}>
        {latestWebsiteLead === null ? (
          <Quiet>
            No enquiry has come in from the website&apos;s forms yet. If the website is live, check that its PLATFORM_LEADS_URL and LEADS_API_TOKEN are set in
            Vercel; until then enquiries reach the email inbox only.
          </Quiet>
        ) : (
          <p className="text-sm text-ink-2">
            The last website enquiry arrived on <LocalDateTime iso={latestWebsiteLead.toISOString()} variant="timestamp" />.
          </p>
        )}
      </Section>

      {teams === null ? null : (
        <Section id="teams" title="Teams alerts" aside="Admins only">
          <div className="grid max-w-2xl gap-8">
            <p className="text-sm text-ink-soft">
              Each kind of alert can go to its own Teams channel. In Teams, open the channel, choose Workflows and use{" "}
              <b className="font-medium text-ink">Post to a channel when a webhook request is received</b>. Paste the address it gives you
              below. The address is kept encrypted and is never shown again. An alert with no address set is not sent to Teams.
            </p>
            {TEAMS_DESTINATIONS.map((destination) => {
              const state = teams[destination];
              const info = TEAMS_DESTINATION_INFO[destination];
              const inputId = `teams-${destination}`;
              return (
                <form key={destination} action={saveTeamsWebhookAction} className="grid gap-3 border-t border-line pt-6 first:border-t-0 first:pt-0">
                  <input type="hidden" name={TEAMS_DESTINATION_FIELD} value={destination} />
                  <div>
                    <label htmlFor={inputId} className={labelClasses}>
                      {info.label}
                    </label>
                    <p className={hintClasses}>{info.posts}</p>
                  </div>
                  <SecretInput
                    id={inputId}
                    name={TEAMS_URL_FIELD}
                    maxLength={MAX_TEAMS_URL_LENGTH}
                    placeholder={state.state === "unset" ? "Paste the webhook address" : "Paste a new address to replace the saved one"}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <p className="text-sm text-ink-soft">
                    {state.state === "unset" ? "Not set." : state.state === "set" ? "An address is saved." : "An address is saved but can no longer be read. Paste it again."}
                    {state.state === "unset" ? null : (
                      <>
                        {" "}
                        Last changed {state.changedBy === null ? "" : `by ${state.changedBy} `}on <LocalDateTime iso={state.changedAt.toISOString()} variant="timestamp" />
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <GatedSubmitButton className={buttonPrimary} pendingLabel="Saving…">
                      Save address
                    </GatedSubmitButton>
                    {state.state === "unset" ? null : (
                      <>
                        <button type="submit" formAction={testTeamsWebhookAction} formNoValidate className={buttonSecondary}>
                          Send test
                        </button>
                        <button type="submit" formAction={removeTeamsWebhookAction} formNoValidate className={buttonDanger}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </form>
              );
            })}
          </div>
        </Section>
      )}
    </>
  );
}
