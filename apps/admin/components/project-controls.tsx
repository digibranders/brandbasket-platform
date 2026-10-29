import { canMoveProject, findOpenProjectForStaff, listAssignableSupportStaff } from "@brandbasket/db";
import type { ReactElement } from "react";
import { GatedSubmitButton } from "@brandbasket/shared/ui/forms/submit-gate";
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
  planLaunchAction,
} from "@/app/(protected)/clients/[businessId]/project/actions";

interface ProjectControlsProps {
  readonly businessId: string;
  /** The raw `move` query parameter; only a known notice is shown. */
  readonly notice: string | string[] | undefined;
}

/** Hand moves on the business's open build: builder, extra round, cancel. Start, hold and resume are in the website build section. */
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

        {canMoveProject("grant-round", project.status) ? (
          <form action={grantRoundAction}>
            {ids}
            <GatedSubmitButton className={buttonSecondary}>Add a round of changes</GatedSubmitButton>
          </form>
        ) : null}

        {canMoveProject("grant-round", project.status) ? (
          <p className="text-sm text-ink-2">
            Rounds of changes used: <span className="font-figure tabular-nums">{project.revisionRoundsUsed} of {project.revisionRoundsIncluded}</span>
          </p>
        ) : null}

        {canMoveProject("plan-launch", project.status) ? (
          <form action={planLaunchAction} className="grid max-w-md gap-2">
            {ids}
            <label htmlFor="launchDay" className={labelClasses}>
              Planned launch day
            </label>
            <input id="launchDay" name="launchDay" type="date" defaultValue={project.launchPlannedOn ?? ""} className={fieldClasses} />
            <p className="text-sm text-ink-2">The client sees this on their website page once it is set. Leave it empty to show no day.</p>
            <button type="submit" className={`${buttonSecondary} justify-self-start`}>
              Save launch day
            </button>
          </form>
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
