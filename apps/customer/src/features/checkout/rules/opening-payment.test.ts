import { expect, it } from "vitest";
import { nextOpeningPayment, type OpeningPayment } from "./opening-payment";

const IDLE = { status: "idle" };
const REFUSED = { status: "error", message: "No" };
const start: OpeningPayment = { held: false, result: IDLE };

it("holds the button from the first press", () => {
  expect(nextOpeningPayment(start, true, IDLE)).toEqual({ held: true, result: IDLE });
});

it("keeps holding after the action stops pending when it left the page without a result, as a redirect does", () => {
  const held = nextOpeningPayment(start, true, IDLE);
  expect(nextOpeningPayment(held, false, IDLE)).toBe(held);
});

it("lets go when the action comes back with a result, so a refusal can be pressed again", () => {
  const held = nextOpeningPayment(start, true, IDLE);
  expect(nextOpeningPayment(held, false, REFUSED)).toEqual({ held: false, result: REFUSED });
});

it("does not hold a button that was never pressed", () => {
  expect(nextOpeningPayment(start, false, IDLE)).toBe(start);
});

it("holds again on a press made after a refusal", () => {
  const refused: OpeningPayment = { held: false, result: REFUSED };
  expect(nextOpeningPayment(refused, true, REFUSED)).toEqual({ held: true, result: REFUSED });
});
