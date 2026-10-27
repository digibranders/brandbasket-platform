import type { ChangeCoverage, ChangeKind, ChangeState } from "@brandbasket/db/change-states";
import { customerStatus } from "@brandbasket/shared/lib/change-requests";

/** The nine states in the team's words, with what the customer sees beside them. */
const STATE_LABELS: Readonly<Record<ChangeState, string>> = {
  requested: "Waiting for us",
  quoted: "Quote sent",
  in_progress: "In progress",
  preview: "Sent for checking",
  revisions: "Fix asked",
  approved: "Approved by the customer",
  shipped: "Done",
  declined: "Declined",
  withdrawn: "Quote turned down",
};

/** "Quote sent (customer sees: Quoted)". */
export function stateLabel(state: ChangeState): string {
  return `${STATE_LABELS[state]} (customer sees: ${customerStatus(state)})`;
}

const COVERAGE_LABELS: Readonly<Record<ChangeCoverage, string>> = {
  undecided: "Not decided",
  included: "Included edit",
  free: "No charge",
  paid: "Paid quote",
};

export function coverageLabel(coverage: ChangeCoverage): string {
  return COVERAGE_LABELS[coverage];
}

export interface StaffControls {
  /** Send a quote, or a new one. */
  readonly quote: boolean;
  /** Count it as one of the month's included edits. */
  readonly includedEdit: boolean;
  /** Do it at no charge. */
  readonly noCharge: boolean;
  /** Send it to the customer to check. */
  readonly sendForChecking: boolean;
  readonly markDone: boolean;
  readonly decline: boolean;
}

interface ControlsInput {
  readonly state: ChangeState;
  readonly kind: ChangeKind;
  readonly accepted: boolean;
}

/**
 * Which buttons a request gets. They follow the arrows the database allows (CHANGE_MOVES): a quote the customer has accepted
 * can be replaced (the charge is given back) but not turned into free work, and an included edit needs a website change
 * and one left in the month.
 */
export function staffControls(request: ControlsInput, includedLeft: number): StaffControls {
  const undecided = request.state === "requested" || (request.state === "quoted" && !request.accepted);
  return {
    quote: request.state === "requested" || request.state === "quoted",
    includedEdit: undecided && request.kind === "website" && includedLeft > 0,
    noCharge: undecided,
    sendForChecking: request.state === "in_progress" || request.state === "revisions",
    markDone: request.state === "in_progress" || request.state === "preview" || request.state === "revisions" || request.state === "approved",
    decline: ["requested", "quoted", "in_progress", "preview", "revisions"].includes(request.state),
  };
}
