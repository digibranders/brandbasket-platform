import type { Finding } from "./sweep.spec";

/*
 * App bugs the sweep has found and docs/customer-app-v4/E2E-REVIEW.md records. A finding that matches an entry is
 * reported as an annotation instead of failing the test. Remove an entry when its bug is fixed.
 */

interface KnownIssue {
  /** The issue number in E2E-REVIEW.md. */
  readonly id: string;
  readonly check: Finding["check"];
  /** Text the finding's detail contains. */
  readonly match: RegExp;
  readonly accounts?: readonly string[];
  readonly routes?: readonly string[];
  readonly sizes?: readonly ("desktop" | "mobile")[];
}

export const KNOWN_ISSUES: readonly KnownIssue[] = [
  // TableHead wraps its children in a <tr> and the callers pass a TableRow: <tr> inside <tr>, a hydration error.
  { id: "E2E-08", check: "console", match: /cannot contain a nested|cannot be a child of|Hydration failed|Next dev overlay/, routes: ["help", "website", "website-pages"] },
  { id: "E2E-09", check: "overflow", match: /overflow-x-auto|h-chip/, routes: ["enquiries", "enquiries-open"], sizes: ["mobile"] },
  { id: "E2E-10", check: "overflow", match: /./, routes: ["settings-team"], sizes: ["mobile"] },
  { id: "E2E-23", check: "axe", match: /link-in-text-block/ },
  { id: "E2E-24", check: "axe", match: /nested-interactive|label-content-name-mismatch/, routes: ["business-brand"] },
  { id: "E2E-25", check: "axe", match: /label-content-name-mismatch/, routes: ["request-detail"] },
  // Under concurrent requests, server rendering of forms that call useToast fails ("useToastManager must be used within
  // <Toast.Provider>") and the page answers 500. Sequential requests pass.
  ...(["console", "status"] as const).map((check) => ({
    id: "E2E-02",
    check,
    match: /HTTP 500|status of 500|Next dev overlay: 01 Issue|Toast\.Provider|was instantiated because it was required/,
    routes: ["settings", "settings-security", "settings-notifications", "settings-privacy", "settings-team", "billing-payment", "business", "business-brand", "social-content", "requests", "request-detail", "enquiries-open"],
  })),
];

export function knownIssueFor(input: { readonly account: string; readonly route: string; readonly size: string; readonly finding: Finding }): string | null {
  const issue = KNOWN_ISSUES.find(
    (candidate) =>
      candidate.check === input.finding.check &&
      candidate.match.test(input.finding.detail) &&
      (candidate.accounts === undefined || candidate.accounts.includes(input.account)) &&
      (candidate.routes === undefined || candidate.routes.includes(input.route)) &&
      (candidate.sizes === undefined || (candidate.sizes as readonly string[]).includes(input.size)),
  );
  return issue?.id ?? null;
}
