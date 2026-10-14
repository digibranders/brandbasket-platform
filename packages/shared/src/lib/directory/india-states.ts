/**
 * India's states and union territories by ISO 3166-2:IN code. The implementation lives in @fynix/db (shared depends
 * on db, so db cannot import it from here); it is re-exported from the @fynix/db/india-states subpath, not the
 * barrel, so importing it never pulls in drizzle or pg.
 */
export {
  INDIA_STATES,
  isIndiaStateCode,
  stateCodeOfIndiaPostName,
  stateName,
  type IndiaState,
} from "@fynix/db/india-states";
