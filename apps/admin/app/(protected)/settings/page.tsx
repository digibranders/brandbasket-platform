import type { Metadata } from "next";
import type { ReactElement } from "react";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
import { LocalDateTime } from "@brandbasket/shared/ui/panel/local-date-time";
import { MAX_SETUP_CALL_URL_LENGTH, SETUP_CALL_URL_FIELD } from "@brandbasket/shared/lib/setup-call-link";
import { buttonPrimary } from "@/components/console/buttons";
import { fieldClasses, hintClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { PageHeader } from "@/components/console/page-header";
import { Quiet, Section } from "@/components/console/section";
import { readSettingsNotice, SETTINGS_NOTICES } from "@/lib/settings-notices";
import { loadSetupCallSetting } from "@/lib/server/settings-admin";
import { requireStaffAccess } from "@/lib/server/staff-access";
import { saveSetupCallUrlAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };

/** What staff can change without a developer. Today that is one thing: where the Book a call button on the dashboard goes. */
export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactElement> {
  await requireStaffAccess();
  const [setting, params] = await Promise.all([loadSetupCallSetting(), searchParams]);
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
    </>
  );
}
