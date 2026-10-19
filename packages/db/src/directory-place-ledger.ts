/**
 * The source refs the dataset's place ledger (local-directory-data/thane/thane-place-ledger.json) is keyed by:
 * "overture:<id>" and "osm:<type>/<id>" for open-data rows, and "survey:0x<hex>:0x<hex>" for a business the Brandbasket
 * team surveyed that the open data lacks (local-directory-data/thane/import_survey.py, 2026-10-06).
 */
const OPEN_DATA_REF = /^(overture|osm):[A-Za-z0-9/_.-]{1,120}$/;
const SURVEY_REF = /^survey:0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}$/;

export function isLedgerSourceRef(ref: string): boolean {
  return OPEN_DATA_REF.test(ref) || SURVEY_REF.test(ref);
}
