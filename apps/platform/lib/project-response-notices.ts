/** What /project says after a customer responds to a preview. */
export type ProjectResponseNotice = "approved" | "revisions-requested" | "not-ready";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
interface ProjectResponseNoticeCopy {
  readonly text: string;
  readonly ok: boolean;
  /** Whether the notice asks the customer to book a call, so the page links the booking page after it. */
  readonly offersCall: boolean;
}

export const PROJECT_RESPONSE_NOTICES: Readonly<Record<ProjectResponseNotice, ProjectResponseNoticeCopy>> = {
  approved: {
    text: "Thanks. You approved this preview, and we’ll be in touch about getting it live.",
    ok: true,
    offersCall: false,
  },
  "revisions-requested": {
    text: "Thanks. We’ve marked this as needing another look. Book a call and we’ll go through what to change.",
    ok: true,
    offersCall: true,
  },
  "not-ready": {
    text: "Nothing sent: there’s no preview waiting for your response right now.",
    ok: false,
    offersCall: false,
  },
};

export function projectResponseNoticeHref(notice: ProjectResponseNotice): string {
  return `/project?response=${notice}`;
}

export function readProjectResponseNotice(value: string | string[] | undefined): ProjectResponseNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_RESPONSE_NOTICES, value)
    ? (value as ProjectResponseNotice)
    : null;
}
