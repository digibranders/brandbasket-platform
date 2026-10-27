import type { ProjectStatus } from "@brandbasket/db";
import { PROJECT_STATUS_LABELS } from "@brandbasket/shared/lib/project-status";
import type { ReactElement } from "react";
import {
  putOnHoldAction,
  resumeBuildingAction,
  retakePreviewPictureAction,
  startBuildingAction,
} from "@/app/(protected)/clients/[businessId]/website-actions";
import { buttonPrimary, buttonSecondary } from "@/components/console/buttons";
import { fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { FactList, Section, type Fact } from "@/components/console/section";
import { loadWebsiteBuild, type WebsiteBuild } from "@/lib/server/website-build";
import { HOLD_REASON_MAX, HOLD_REASON_MIN, readWebsiteMoveNotice, WEBSITE_MOVE_NOTICES } from "@/lib/website-form";

const INDIA_DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long" });
const INDIA_MOMENT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const CAN_START: readonly ProjectStatus[] = ["submitted"];
const CAN_PAUSE: readonly ProjectStatus[] = ["submitted", "building", "revisions", "preview"];
const CAN_RESUME: readonly ProjectStatus[] = ["on_hold"];

type Project = NonNullable<WebsiteBuild["project"]>;
type Picture = NonNullable<WebsiteBuild["picture"]>;

function dateFact(label: string, value: Date | null): readonly Fact[] {
  return value === null ? [] : [{ label, value: INDIA_DATE.format(value) }];
}

function factsOf(project: Project): readonly Fact[] {
  return [
    { label: "Status", value: PROJECT_STATUS_LABELS[project.status] },
    ...(project.status === "on_hold" && project.onHoldReason !== null ? [{ label: "Reason", value: project.onHoldReason }] : []),
    ...dateFact("Setup sent", project.onboardingSubmittedAt),
    ...dateFact("First preview due", project.slaDueAt),
    ...dateFact("Preview sent", project.previewSentAt),
    ...dateFact("Went live", project.launchedAt),
  ];
}

/** The stored picture when it is of the project's current link and was taken after that link was sent, else null. */
function currentPicture(project: Project, picture: WebsiteBuild["picture"]): Picture | null {
  if (picture === null || picture.previewUrl !== project.previewUrl) return null;
  return project.previewSentAt === null || picture.capturedAt >= project.previewSentAt ? picture : null;
}

/**
 * The staff moves for a customer's website build: the project's status and dates, the preview picture, and the buttons
 * that apply to the status. `notice` is the raw `website` search param.
 */
export async function WebsiteSection({
  businessId,
  staffId,
  notice,
}: {
  readonly businessId: string;
  readonly staffId: string;
  readonly notice: string | string[] | undefined;
}): Promise<ReactElement> {
  const { project, picture } = await loadWebsiteBuild(businessId, staffId);
  const moved = readWebsiteMoveNotice(notice);
  const hidden = <input type="hidden" name="businessId" value={businessId} />;
  const status = project?.status ?? null;
  const canStart = status !== null && CAN_START.includes(status);
  const canPause = status !== null && CAN_PAUSE.includes(status);
  const canResume = status !== null && CAN_RESUME.includes(status);
  const previewUrl = project?.previewUrl ?? null;
  const fresh = project === null ? null : currentPicture(project, picture);

  return (
    <Section title="Website build" id="website-build">
      {moved === null ? null : (
        <Notice tone={WEBSITE_MOVE_NOTICES[moved].ok ? "ok" : "problem"} className="mb-6">
          {WEBSITE_MOVE_NOTICES[moved].text}
        </Notice>
      )}
      {project === null ? (
        <p className="text-ink-soft">No project yet.</p>
      ) : (
        <>
          <FactList items={factsOf(project)} />
          {previewUrl === null ? null : (
            <p className="mt-5 text-sm text-ink-soft">{fresh === null ? "Picture not taken" : `Picture taken ${INDIA_MOMENT.format(fresh.capturedAt)}`}</p>
          )}
          {canStart || canPause || canResume ? null : <p className="mt-5 text-ink-soft">Nothing to do here.</p>}
          <div className="mt-6 flex flex-wrap items-start gap-3">
            {canStart ? (
              <form action={startBuildingAction}>
                {hidden}
                <button type="submit" className={`${buttonPrimary} !px-4 !py-2`}>
                  Start building
                </button>
              </form>
            ) : null}
            {canResume ? (
              <form action={resumeBuildingAction}>
                {hidden}
                <button type="submit" className={`${buttonPrimary} !px-4 !py-2`}>
                  Resume
                </button>
              </form>
            ) : null}
            {previewUrl !== null && fresh === null ? (
              <form action={retakePreviewPictureAction}>
                {hidden}
                <button type="submit" className={`${buttonSecondary} !px-3 !py-1.5 text-sm`}>
                  Take the picture again
                </button>
              </form>
            ) : null}
          </div>
          {canPause ? (
            <form action={putOnHoldAction} className="mt-6 grid max-w-xl gap-4">
              {hidden}
              <div>
                <label htmlFor="website-hold-reason" className={labelClasses}>
                  The customer reads this exactly as you type it.
                </label>
                <input
                  id="website-hold-reason"
                  name="reason"
                  type="text"
                  required
                  minLength={HOLD_REASON_MIN}
                  maxLength={HOLD_REASON_MAX}
                  className={fieldClasses}
                />
              </div>
              <div>
                <button type="submit" className={`${buttonSecondary} !px-4 !py-2`}>
                  Put on hold
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </Section>
  );
}
