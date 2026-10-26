/** What the console's search can find, in the order the results are listed. */
export const SEARCH_KINDS = ["client", "enquiry", "request", "invoice"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export const SEARCH_KIND_LABELS: Readonly<Record<SearchKind, string>> = {
  client: "Clients",
  enquiry: "Enquiries",
  request: "Requests",
  invoice: "Invoices",
};

/** One result: what it is, a line to show, a quieter line under it, and where it opens. */
export interface SearchHit {
  readonly kind: SearchKind;
  readonly label: string;
  readonly sub: string;
  readonly href: string;
}
