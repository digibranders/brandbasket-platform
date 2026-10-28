const PROJECT_ID = /^prj_[A-Za-z0-9]+$/;
const TEAM_ID = /^team_[A-Za-z0-9]+$/;
const MAX_ID_LENGTH = 64;

export type ParsedHosting =
  | { readonly success: true; readonly vercelProjectId: string; readonly vercelTeamId: string | null }
  | { readonly success: false };

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The Hosting form: the Vercel project id (`prj_...`) the client's website runs on, and optionally its team id
 * (`team_...`). Both are copied from the project's settings on Vercel, so a name or an address is refused rather than
 * guessed at: the pause call needs the id. The project id is required; the form cannot clear it.
 */
export function parseHostingForm(projectId: FormDataEntryValue | null, teamId: FormDataEntryValue | null): ParsedHosting {
  const project = text(projectId);
  const team = text(teamId);
  if (project.length > MAX_ID_LENGTH || !PROJECT_ID.test(project)) return { success: false };
  if (team !== "" && (team.length > MAX_ID_LENGTH || !TEAM_ID.test(team))) return { success: false };
  return { success: true, vercelProjectId: project, vercelTeamId: team === "" ? null : team };
}
