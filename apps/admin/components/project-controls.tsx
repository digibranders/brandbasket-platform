import { canMoveProject, findOpenProjectForStaff, listAssignableSupportStaff, ON_HOLD_REASON_MAX } from "@brandbasket/db";
import type { ReactElement } from "react";
import { buttonDanger, buttonSecondary } from "@/components/console/buttons";
import { checkboxClasses, fieldClasses, labelClasses } from "@/components/console/field-styles";
import { Notice } from "@/components/console/notice";
import { Section } from "@/components/console/section";
import { StatusPill } from "@/components/console/status-pill";
import { PROJECT_MOVE_NOTICES, readProjectMoveNotice } from "@/lib/project-move-notices";
import { getStaffDb } from "@/lib/server/db";
import {
  assignBuilderAction,
  cancelProjectAction,
  grantRoundAction,
  holdProjectAction,
  resumeProjectAction,
  startBuildingAction,
} from "@/app/(protected)/clients/[businessId]/project/actions";

interface ProjectControlsProps {
  readonly businessId: string;
  /** The raw `move` query parameter; only a known notice is shown. */
  readonly notice: string | string[] | undefined;
}

/** Hand moves on the business's open build: start building, hold, resume, builder, extra round, cancel. */
export async function ProjectControls({ businessId, notice }: ProjectControlsProps): Promise<ReactElement | null> {
  const db = getStaffDb();
  const [project, staff] = await Promise.all([findOpenProjectForStaff(db, businessId), listAssignableSupportStaff(db)]);
  const shown = readProjectMoveNotice(notice);
  if (project === null) {
    return shown === null ? null : <Notice tone={PROJECT_MOVE_NOTICES[shown].ok ? "ok" : "problem"}>{PROJECT_MOVE_NOTICES[shown].text}</Notice>;
  }
  const ids = (
    <>
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="projectId" value={project.id} />
    </>
  );

  return (
    <Section title="Build controls" aside={project.status === "on_hold" ? <StatusPill tone="todo">On hold</StatusPill> : undefined}>
      <div className="grid gap-5">
        {shown === null ? null : <Notice tone={PROJECT_MOVE_NOTICES[shown].ok ? "ok" : "problem"}>{PROJECT_MOVE_NOTICES[shown].text}</Notice>}

        {project.status === "on_hold" && project.onHoldReason !== null ? (
          <p className="text-sm text-ink-2">The client sees: {project.onHoldReason}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {canMoveProject("start-building", project.status) ? (
            <form action={startBuildingAction}>
              {ids}
              <button type="submit" className={buttonSecondary}>Start building</button>
            </form>
          ) : null}
          {canMoveProject("resume", project.status) ? (
            <form action={resumeProjectAction}>
              {ids}
              <button type="submit" className={buttonSecondary}>Resume</button>
            </form>
          ) : null}
          {canMoveProject("grant-round", project.status) ? (
            <form action={grantRoundAction}>
              {ids}
              <button type="submit" className={buttonSecondary}>
                Add a round of changes
              </button>
            </form>
          ) : null}
        </div>

        {canMoveProject("grant-round", project.status) ? (
          <p className="text-sm text-ink-2">
            Rounds of changes used: <span className="font-figure tabular-nums">{project.revisionRoundsUsed} of {project.revisionRoundsIncluded}</span>
          </p>
        ) : null}

        {canMoveProject("assign", project.status) ? (
          <form action={assignBuilderAction} className="grid max-w-md gap-2">
            {ids}
            <label htmlFor="builder" className={labelClasses}>
              Builder
            </label>
            <select id="builder" name="builder" defaultValue={project.assignedStaffId ?? ""} className={fieldClasses}>
              <option value="">No builder</option>
              {staff.map((person) => (
                <option key={person.userId} value={person.userId}>
                  {person.name}
                </option>
              ))}
            </select>
            <button type="submit" className={`${buttonSecondary} justify-self-start`}>
              Save builder
            </button>
          </form>
        ) : null}

        {canMoveProject("hold", project.status) ? (
          <details className="max-w-md">
            <summary className="cursor-pointer text-sm font-semibold text-ink">Put on hold</summary>
            <form action={holdProjectAction} className="mt-3 grid gap-2">
              {ids}
              <label htmlFor="hold-reason" className={labelClasses}>
                Reason the client will see
              </label>
              <input id="hold-reason" name="reason" required maxLength={ON_HOLD_REASON_MAX} placeholder="Waiting for your photos" className={fieldClasses} />
              <button type="submit" className={`${buttonSecondary} justify-self-start`}>
                Put on hold
              </button>
            </form>
          </details>
        ) : null}

        {canMoveProject("cancel", project.status) ? (
          <details className="max-w-md">
            <summary className="cursor-pointer text-sm font-semibold text-error">Cancel this build</summary>
            <form action={cancelProjectAction} className="mt-3 grid gap-3">
              {ids}
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" name="confirm" value="yes" required className={checkboxClasses} />
                <span>I want to cancel this build. Their plan and billing do not change.</span>
              </label>
              <button type="submit" className={`${buttonDanger} justify-self-start`}>
                Cancel build
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </Section>
  );
}
