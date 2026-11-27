import { MAX_REFERRAL_CODE_LENGTH } from "@brandbasket/billing/referral";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startSignupCheckoutAction, type CheckoutSignupResult } from "@/features/entry/actions";
import { CHECKOUT_ACCOUNT_EXISTS_MESSAGE, CHECKOUT_AGREE_MESSAGE } from "@/features/entry/rules/checkout-signup-messages";
import type { ActionResult } from "@/lib/action-result";
import { applyCodeAction, startPaymentAction } from "../actions";
import { buildSignupBasketTable, type SignupBasketTable } from "../rules/signup-basket";
import { SignupCheckoutScreen } from "./signup-checkout-screen";

vi.mock("@/features/entry/actions", () => ({ startSignupCheckoutAction: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("../actions", () => ({ startPaymentAction: vi.fn(), applyCodeAction: vi.fn() }));

const INDIA = buildSignupBasketTable("INR", "razorpay");
const ABROAD = buildSignupBasketTable("USD", "razorpay");
const PHONE_COUNTRIES = [
  { code: "IN", label: "India +91", dialCode: "+91" },
  { code: "AE", label: "United Arab Emirates +971", dialCode: "+971" },
];

const DETAILS = { siteKey: null, phoneCountries: PHONE_COUNTRIES, defaultPhoneCountry: "IN", prefill: null, startToken: "sealed-start" } as const;

function screenWith(table: SignupBasketTable, initialServices: readonly string[] = ["managed-website"]) {
  return render(<SignupCheckoutScreen account="new" table={table} initialServices={initialServices} details={DETAILS} />);
}

const payButtons = () => screen.getAllByRole("button", { name: /^Pay/ });
const card = (title: string) => screen.getByRole("checkbox", { name: new RegExp(`^${title}`) }) as HTMLInputElement;
const summary = () => within(screen.getByRole("heading", { name: "Order Summary" }).closest("article") as HTMLElement);
const allowed: CheckoutSignupResult = { ok: true };
const summaryRowsEmpty = (): boolean => summary().queryByText("Your basket is empty") !== null;

beforeEach(() => {
  vi.mocked(startSignupCheckoutAction).mockReset().mockResolvedValue(allowed);
  push.mockReset();
  vi.mocked(applyCodeAction).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(startPaymentAction).mockReset().mockResolvedValue({ ok: false, message: "We could not open the payment." } satisfies ActionResult);
});

describe("the services", () => {
  it("opens on the services the link chose and shows what is due today", () => {
    screenWith(INDIA, ["managed-website", "social-media"]);
    expect(card("Website Management").checked).toBe(true);
    expect(card("Social Media Management").checked).toBe(true);
    expect(card("Dedicated Expert Monitoring").checked).toBe(false);
    expect(summary().getByText("Social Media Management, first month")).toBeTruthy();
    expect(summary().getByText("₹2,999 a month from next month")).toBeTruthy();
    // The build fee and ₹1 for Social's first month: the website's own month starts with the first monthly charge (plan 65).
    expect(summary().getByText("₹35,001")).toBeTruthy();
    expect(payButtons().map((button) => button.textContent)).toEqual(["Pay ₹35,001", "Pay ₹35,001"]);
  });

  it("changes the rows and the total when a card is toggled", async () => {
    screenWith(INDIA);
    expect(summary().getByText("Maintenance")).toBeTruthy();
    expect(summary().queryByText("Social Media Management, first month")).toBeNull();
    expect(payButtons()[0]?.textContent).toContain("Pay ₹35,000");

    await userEvent.click(card("Social Media Management"));
    expect(summary().getByText("Social Media Management, first month")).toBeTruthy();
    expect(payButtons()[0]?.textContent).toContain("Pay ₹35,001");

    await userEvent.click(card("Website Management"));
    expect(summary().queryByText("Maintenance")).toBeNull();
    expect(payButtons()[0]?.textContent).toContain("Pay ₹1");
  });

  it("disables Pay for an empty basket and labels it plainly", async () => {
    screenWith(INDIA);
    await userEvent.click(card("Website Management"));
    expect(summary().getByText("Your basket is empty")).toBeTruthy();
    for (const button of payButtons()) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.textContent).toBe("Pay");
    }
  });

  it("holds monitoring until a plan is ticked", async () => {
    screenWith(INDIA, []);
    expect(card("Dedicated Expert Monitoring").disabled).toBe(true);
    await userEvent.click(card("Website Management"));
    expect(card("Dedicated Expert Monitoring").disabled).toBe(false);
    await userEvent.click(card("Dedicated Expert Monitoring"));
    expect(summary().getByText("Dedicated Expert Monitoring")).toBeTruthy();
    await userEvent.click(card("Website Management"));
    expect(card("Dedicated Expert Monitoring").checked).toBe(false);
    expect(summary().getByText("Your basket is empty")).toBeTruthy();
  });

  it("prices a year when Yearly is chosen", async () => {
    screenWith(INDIA, ["managed-website", "social-media"]);
    await userEvent.click(screen.getByRole("button", { name: /Yearly/ }));
    expect(summary().getByText("Paid yearly, 10% off")).toBeTruthy();
    expect(payButtons()[0]?.textContent).toContain("Pay ₹99,778");
    expect(summary().queryByText("Social Media Management, first month")).toBeNull();
  });
});

describe("the details", () => {
  it("shows the six GSTIN fields only once the box is ticked", async () => {
    screenWith(INDIA);
    for (const label of ["GSTIN", "Legal business name", "Address line 1", "Address line 2 (optional)", "Pincode", "City"]) expect(screen.queryByLabelText(label)).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "My business has a GSTIN" }));
    for (const label of ["GSTIN", "Legal business name", "Address line 1", "Address line 2 (optional)", "Pincode", "City"]) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it("asks a visitor in India for a state", () => {
    screenWith(INDIA);
    expect(screen.getByText("State")).toBeTruthy();
    expect(screen.getByText("Used for GST on your invoices.")).toBeTruthy();
  });

  it("shows dollars, no State and no GSTIN to a visitor outside India, whatever phone code they pick", async () => {
    screenWith(ABROAD, ["managed-website", "social-media"]);
    expect(card("Website Management").closest("label")?.textContent).toContain("$59");
    // The $1,200 build fee and $1 for Social's first month (plan 65).
    expect(summary().getByText("$1,201")).toBeTruthy();
    expect(screen.queryByText("State")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "My business has a GSTIN" })).toBeNull();
    expect(screen.getByText("Choose the services you want. Prices are in dollars.")).toBeTruthy();

    await userEvent.click(screen.getByRole("combobox", { name: /Country code/ }));
    await userEvent.click(await screen.findByRole("option", { name: "India +91" }));
    expect(screen.queryByText("State")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "My business has a GSTIN" })).toBeNull();
    expect(summary().getByText("$1,201")).toBeTruthy();
  });

  it("names the business on the invoice as it is typed", async () => {
    screenWith(INDIA);
    expect(screen.getByText("Not registered for GST? No problem: your invoice will be made out to your business name.")).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Business name"), "Shah Sweets");
    expect(screen.getByText("Not registered for GST? No problem: your invoice will be made out to Shah Sweets.")).toBeTruthy();
  });
});

describe("paying", () => {
  const agree = () => userEvent.click(screen.getByRole("checkbox", { name: /I agree to the/ }));

  it("shows the Terms message at the box and posts nothing when Pay is pressed unticked", async () => {
    screenWith(INDIA);
    await userEvent.click(payButtons()[0]!);
    expect(screen.getByRole("alert").textContent).toContain(CHECKOUT_AGREE_MESSAGE);
    expect(startSignupCheckoutAction).not.toHaveBeenCalled();
    await agree();
    expect(screen.queryByText(CHECKOUT_AGREE_MESSAGE)).toBeNull();
  });

  it("shows the Terms message the server sends at the box", async () => {
    vi.mocked(startSignupCheckoutAction).mockResolvedValue({ ok: false, message: CHECKOUT_AGREE_MESSAGE, fieldErrors: { agree: CHECKOUT_AGREE_MESSAGE }, field: "agree" });
    screenWith(INDIA);
    await agree();
    await userEvent.click(payButtons()[0]!);
    expect((await screen.findByRole("alert")).textContent).toContain(CHECKOUT_AGREE_MESSAGE);
    expect(startPaymentAction).not.toHaveBeenCalled();
  });

  it("opens the account first and the payment only after it succeeded, sending the payment no details", async () => {
    screenWith(INDIA, ["managed-website", "social-media"]);
    await userEvent.type(screen.getByLabelText("Your name"), "Meera Shah");
    await userEvent.type(screen.getByLabelText("Business name"), "Shah Sweets");
    await userEvent.type(screen.getByLabelText("Email"), "meera@example.test");
    await userEvent.type(screen.getByLabelText("Mobile number"), "9820011223");
    await agree();
    await userEvent.click(payButtons()[0]!);

    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(1));
    const [signupCall, paymentCall] = [vi.mocked(startSignupCheckoutAction).mock, vi.mocked(startPaymentAction).mock];
    expect(signupCall.invocationCallOrder[0]!).toBeLessThan(paymentCall.invocationCallOrder[0]!);

    const opened = signupCall.calls[0]![1];
    expect(opened.getAll("service")).toEqual(["managed-website", "social-media"]);
    expect(opened.get("billing")).toBe("monthly");
    expect(opened.get("name")).toBe("Meera Shah");
    expect(opened.get("businessName")).toBe("Shah Sweets");
    expect(opened.get("email")).toBe("meera@example.test");
    expect(opened.get("phone")).toBe("9820011223");
    expect(opened.get("agree")).toBe("yes");
    expect(opened.get("start")).toBe("sealed-start");
    expect(opened.has("country")).toBe(false);

    const payment = paymentCall.calls[0]![1];
    expect([...payment.keys()].sort()).toEqual(["billing", "service", "service", "siteKind", "tier"]);
    expect(payment.get("tier")).toBe("managed");
    expect(payment.get("billing")).toBe("monthly");
    expect(payment.getAll("service")).toEqual(["managed-website", "social-media"]);
  });

  it("sends the yearly choice to both posts", async () => {
    screenWith(INDIA);
    await userEvent.click(screen.getByRole("button", { name: /Yearly/ }));
    await agree();
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(startSignupCheckoutAction).mock.calls[0]![1].get("billing")).toBe("yearly");
    expect(vi.mocked(startPaymentAction).mock.calls[0]![1].get("billing")).toBe("yearly");
  });

  it("shows a refusal from the payment above the Pay button and tries only the payment again", async () => {
    screenWith(INDIA);
    await agree();
    await userEvent.click(payButtons()[0]!);
    expect(await screen.findByText("We could not open the payment.")).toBeTruthy();
    
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(2));
    expect(startSignupCheckoutAction).toHaveBeenCalledTimes(1);
  });

  it("does not open a payment when the account was refused", async () => {
    vi.mocked(startSignupCheckoutAction).mockResolvedValue({ ok: false, message: "We can't take new sign-ups right now. Please try again later." });
    screenWith(INDIA);
    await agree();
    await userEvent.click(payButtons()[0]!);
    expect(await screen.findByText("We can't take new sign-ups right now. Please try again later.")).toBeTruthy();
    expect(startPaymentAction).not.toHaveBeenCalled();
  });

  it("puts a field's refusal under that field", async () => {
    vi.mocked(startSignupCheckoutAction).mockResolvedValue({ ok: false, message: "Tell us your name.", fieldErrors: { name: "Tell us your name." }, field: "name" });
    screenWith(INDIA);
    await agree();
    await userEvent.click(payButtons()[0]!);
    const message = await screen.findByText("Tell us your name.");
    expect(message.closest("[data-invalid]")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("offers Sign in and Forgot password under Email when the address has an account", async () => {
    vi.mocked(startSignupCheckoutAction).mockResolvedValue({
      ok: false,
      message: CHECKOUT_ACCOUNT_EXISTS_MESSAGE,
      fieldErrors: { email: CHECKOUT_ACCOUNT_EXISTS_MESSAGE },
      field: "email",
      accountExists: true,
    });
    screenWith(INDIA);
    await agree();
    await userEvent.click(payButtons()[0]!);
    expect(await screen.findByText(CHECKOUT_ACCOUNT_EXISTS_MESSAGE)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Sign in" }).map((link) => link.getAttribute("href"))).toEqual(["/login", "/login"]);
    expect(screen.getByRole("link", { name: "Forgot password" }).getAttribute("href")).toBe("/forgot-password");
    expect(startPaymentAction).not.toHaveBeenCalled();
  });
});

describe("for a signed-in owner whose sign-up has not paid", () => {
  const agree = () => userEvent.click(screen.getByRole("checkbox", { name: /I agree to the/ }));
  const signedIn = (services: readonly string[] = ["managed-website", "social-media"], extra: { readonly standalone?: boolean; readonly paymentFailed?: boolean } = {}) =>
    render(<SignupCheckoutScreen account="signed-in" table={INDIA} initialServices={services} {...extra} />);

  it("shows the services and the order but none of the account fields", () => {
    signedIn();
    for (const label of ["Your name", "Business name", "Email", "Mobile number"]) expect(screen.queryByLabelText(label)).toBeNull();
    expect(screen.queryByText("State")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "My business has a GSTIN" })).toBeNull();
    expect(screen.queryByText("Business Details")).toBeNull();
    expect(screen.queryByText(/Already have an account/)).toBeNull();
    expect(card("Website Management").checked).toBe(true);
    expect(payButtons().map((button) => button.textContent)).toEqual(["Pay ₹35,001", "Pay ₹35,001"]);
  });

  it("keeps the Terms tick and posts only the payment: no account post and no details", async () => {
    signedIn();
    await userEvent.click(payButtons()[0]!);
    expect(screen.getByRole("alert").textContent).toContain(CHECKOUT_AGREE_MESSAGE);
    expect(startPaymentAction).not.toHaveBeenCalled();

    await agree();
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(1));
    expect(startSignupCheckoutAction).not.toHaveBeenCalled();
    const payment = vi.mocked(startPaymentAction).mock.calls[0]![1];
    expect([...payment.keys()].sort()).toEqual(["billing", "service", "service", "siteKind", "tier"]);
    expect(payment.getAll("service")).toEqual(["managed-website", "social-media"]);
    expect(await screen.findByText("We could not open the payment.")).toBeTruthy();
  });

  it("opens on no service when none was chosen, and cannot pay for nothing", () => {
    signedIn([]);
    expect(summaryRowsEmpty()).toBe(true);
    for (const button of payButtons()) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("draws no page frame where the route has one, and says a payment did not go through", () => {
    const { container } = signedIn(undefined, { standalone: false, paymentFailed: true });
    expect(container.querySelector("main")).toBeNull();
    expect(container.querySelector("header header, body > header")).toBeNull();
    expect(screen.getByText("Payment declined.")).toBeTruthy();
  });

  it("uses the same order panel and pay bar as the visitor's screen", () => {
    // Generated ids differ between two renders; nothing else should.
    const plain = (html: string | undefined): string | undefined => html?.replace(/="[^"]*_r_[^"]*"/g, '=""');
    const panelOf = (root: HTMLElement) => plain( [...root.querySelectorAll("article")].find((article) => article.querySelector("h2")?.textContent === "Order Summary")?.innerHTML);
    const barOf = (root: HTMLElement) => plain(root.querySelector(".fixed.bottom-0")?.innerHTML);
    const first = signedIn().container;
    const [signedInPanel, signedInBar] = [panelOf(first), barOf(first)];
    cleanup();
    const second = screenWith(INDIA, ["managed-website", "social-media"]).container;
    expect(signedInPanel).toBeTruthy();
    expect(signedInBar).toBeTruthy();
    expect(panelOf(second)).toBe(signedInPanel);
    expect(barOf(second)).toBe(signedInBar);
  });
});

describe("once the account is opened in this mount", () => {
  const fill = async () => {
    await userEvent.type(screen.getByLabelText("Your name"), "Meera Shah");
    await userEvent.type(screen.getByLabelText("Business name"), "Shah Sweets");
    await userEvent.type(screen.getByLabelText("Email"), "meera@example.test");
    await userEvent.type(screen.getByLabelText("Mobile number"), "9820011223");
    await userEvent.click(screen.getByRole("checkbox", { name: /I agree to the/ }));
  };

  it("locks the details it was opened with, so a later edit cannot be ignored", async () => {
    screenWith(INDIA);
    await fill();
    for (const label of ["Your name", "Business name", "Email", "Mobile number"]) expect((screen.getByLabelText(label) as HTMLInputElement).readOnly).toBe(false);
    await userEvent.click(payButtons()[0]!);
    await screen.findByText("We could not open the payment.");
    for (const label of ["Your name", "Business name", "Email", "Mobile number"]) expect((screen.getByLabelText(label) as HTMLInputElement).readOnly).toBe(true);
  });

  it("stays the same screen, details kept and locked, when the page is drawn again as signed in, and then pays only", async () => {
    const view = screenWith(INDIA);
    await fill();
    await userEvent.click(payButtons()[0]!);
    await screen.findByText("We could not open the payment.");

    // The first post set the session, so the server draws /signup again in its signed-in mode.
    view.rerender(<SignupCheckoutScreen account="signed-in" table={INDIA} initialServices={["managed-website"]} details={DETAILS} />);
    const email = screen.getByLabelText("Email") as HTMLInputElement;
    expect(email.value).toBe("meera@example.test");
    expect(email.readOnly).toBe(true);

    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(2));
    expect(startSignupCheckoutAction).toHaveBeenCalledTimes(1);
  });

  it("does not lock anything while the account was refused", async () => {
    vi.mocked(startSignupCheckoutAction).mockResolvedValue({ ok: false, message: CHECKOUT_ACCOUNT_EXISTS_MESSAGE, fieldErrors: { email: CHECKOUT_ACCOUNT_EXISTS_MESSAGE }, field: "email", accountExists: true });
    screenWith(INDIA);
    await fill();
    await userEvent.click(payButtons()[0]!);
    await screen.findByText(CHECKOUT_ACCOUNT_EXISTS_MESSAGE);
    expect((screen.getByLabelText("Email") as HTMLInputElement).readOnly).toBe(false);
  });
});

describe("the code box", () => {
  const agree = () => userEvent.click(screen.getByRole("checkbox", { name: /I agree to the/ }));
  const codeBox = () => screen.getByLabelText("Code") as HTMLInputElement;
  const disclosure = () => screen.getByText("Have a code? (optional)").closest("details") as HTMLDetailsElement;
  const typeCode = async (code: string) => {
    await userEvent.click(screen.getByText("Have a code? (optional)"));
    await userEvent.type(codeBox(), code);
  };

  it("is closed until it is asked for, then shows one field and no Apply button", async () => {
    screenWith(INDIA);
    expect(disclosure().hasAttribute("open")).toBe(false);
    await userEvent.click(screen.getByText("Have a code? (optional)"));
    expect(disclosure().hasAttribute("open")).toBe(true);
    expect(codeBox().maxLength).toBe(MAX_REFERRAL_CODE_LENGTH);
    expect(codeBox().placeholder).toBe("e.g. FRIEND15");
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("with no code, posts the account and then the payment, as before", async () => {
    screenWith(INDIA);
    await agree();
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(1));
    expect(applyCodeAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("with a code, opens the account, applies the code to the same services, goes to the checkout and posts no payment", async () => {
    screenWith(INDIA, ["managed-website", "social-media"]);
    await typeCode("FRIEND15");
    await agree();
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push).toHaveBeenCalledWith("/checkout?services=managed-website,social-media");
    expect(startSignupCheckoutAction).toHaveBeenCalledTimes(1);
    const applied = vi.mocked(applyCodeAction).mock.calls[0]![1];
    expect(applied.get("referralCode")).toBe("FRIEND15");
    expect(applied.getAll("service")).toEqual(["managed-website", "social-media"]);
    expect([...applied.keys()].sort()).toEqual(["referralCode", "service", "service"]);
    expect(vi.mocked(startSignupCheckoutAction).mock.invocationCallOrder[0]!).toBeLessThan(vi.mocked(applyCodeAction).mock.invocationCallOrder[0]!);
    expect(startPaymentAction).not.toHaveBeenCalled();
  });

  it("keeps the yearly choice on the way to the checkout", async () => {
    screenWith(INDIA);
    await userEvent.click(screen.getByRole("button", { name: /Yearly/ }));
    await typeCode("FRIEND15");
    await agree();
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout?services=managed-website&billing=yearly"));
  });

  it("shows a refused code under the field, opens the box, posts no payment, and on a retry applies only", async () => {
    vi.mocked(applyCodeAction).mockResolvedValueOnce({ ok: false, message: "That code isn’t valid.", fieldErrors: { referralCode: "Enter the code again." } });
    screenWith(INDIA);
    await typeCode("NOPE");
    await agree();
    await userEvent.click(payButtons()[0]!);
    expect(await screen.findByText("Enter the code again.")).toBeTruthy();
    expect(disclosure().hasAttribute("open")).toBe(true);
    expect(startPaymentAction).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText("That code isn’t valid.")).toBeNull();

    await userEvent.clear(codeBox());
    await userEvent.type(codeBox(), "FRIEND15");
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(startSignupCheckoutAction).toHaveBeenCalledTimes(1);
    expect(applyCodeAction).toHaveBeenCalledTimes(2);
  });

  it("lets a refused code be cleared, and then pays without opening the account again", async () => {
    vi.mocked(applyCodeAction).mockResolvedValueOnce({ ok: false, message: "That code isn’t valid.", fieldErrors: { referralCode: "Enter the code again." } });
    screenWith(INDIA);
    await typeCode("NOPE");
    await agree();
    await userEvent.click(payButtons()[0]!);
    await screen.findByText("Enter the code again.");
    await userEvent.clear(codeBox());
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(startPaymentAction).toHaveBeenCalledTimes(1));
    expect(startSignupCheckoutAction).toHaveBeenCalledTimes(1);
  });

  it("shows a refusal that names no field in the banner", async () => {
    vi.mocked(applyCodeAction).mockResolvedValueOnce({ ok: false, message: "We could not check that code just now." });
    screenWith(INDIA);
    await typeCode("NOPE");
    await agree();
    await userEvent.click(payButtons()[0]!);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("We could not check that code just now.")).toBeTruthy();
    expect(disclosure().hasAttribute("open")).toBe(true);
  });

  it("for a signed-in owner applies the code and nothing else", async () => {
    render(<SignupCheckoutScreen account="signed-in" table={INDIA} initialServices={["managed-website", "social-media"]} />);
    await typeCode("FRIEND15");
    await agree();
    await userEvent.click(payButtons()[0]!);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/checkout?services=managed-website,social-media"));
    expect(startSignupCheckoutAction).not.toHaveBeenCalled();
    expect(startPaymentAction).not.toHaveBeenCalled();
    expect(vi.mocked(applyCodeAction).mock.calls[0]![1].get("referralCode")).toBe("FRIEND15");
  });

  it("never changes the total, the rows or the Pay label when a code is typed", async () => {
    screenWith(INDIA, ["managed-website", "social-media"]);
    const before = [summary().getByText("Due today").parentElement?.textContent, payButtons()[0]?.textContent, summary().getByRole("list").textContent];
    await typeCode("FRIEND15");
    const after = [summary().getByText("Due today").parentElement?.textContent, payButtons()[0]?.textContent, summary().getByRole("list").textContent];
    expect(after).toEqual(before);
  });
});

describe("a paid deal link (plan 66)", () => {
  const link = { interval: "month", discountCents: 500_000, note: "As agreed on call", listCents: 6_500_000, advanceCents: 2_000_000 } as const;

  it("shows the build price, the discount, the balance and the advance as the one amount to pay, with the refund line", () => {
    render(<SignupCheckoutScreen account="new" table={INDIA} initialServices={["managed-website", "social-media"]} initialKind="ecommerce" link={link} details={DETAILS} />);
    expect(summary().getByText("Ecommerce store build")).toBeTruthy();
    expect(summary().getByText("-₹5,000")).toBeTruthy();
    expect(summary().getByText("Balance at go-live")).toBeTruthy();
    expect(summary().getByText("Advance to pay now")).toBeTruthy();
    expect(summary().getByText("The advance is non-refundable.")).toBeTruthy();
    expect(summary().getByText(/charged with the balance when your website is ready/)).toBeTruthy();
    expect(payButtons().map((button) => button.textContent)).toEqual(["Pay ₹20,000", "Pay ₹20,000"]);
    expect(summary().queryByText(/referral|code/i)).toBeNull();
  });
});

describe("a paid deal's balance screen (plan 66)", () => {
  const balance = { cents: 500_000, codeLabel: null, codeCents: 0, nextCharge: "Sun 27 Dec" };
  const link = { interval: "month", discountCents: 0, note: null, listCents: 1_000_000, advanceCents: 500_000, balance } as const;

  it("shows the balance, the services' first period and the total to pay now, with when the plan starts and no code box or refund line", () => {
    render(<SignupCheckoutScreen account="signed-in" table={buildSignupBasketTable("INR", "razorpay", { "social-media": false })} initialServices={["managed-website", "social-media"]} link={link} standalone={false} />);
    expect(summary().getByText("Balance for your website build")).toBeTruthy();
    expect(summary().getByText("₹5,000")).toBeTruthy();
    expect(summary().getByText("Social Media Management, first month")).toBeTruthy();
    expect(summary().getByText("Total to pay now")).toBeTruthy();
    expect(summary().getByText("Your monthly plan starts today. Next charge on Sun 27 Dec.")).toBeTruthy();
    expect(payButtons().map((button) => button.textContent)).toEqual(["Pay ₹8,000", "Pay ₹8,000"]);
    expect(summary().queryByText(/non-refundable/)).toBeNull();
    expect(summary().queryByText(/referral|code/i)).toBeNull();
    expect(summary().queryByText("Advance to pay now")).toBeNull();
  });

  it("does not describe a sign-up: no 'choose the services' lead, no build-fee badge, no steps of a build; a plain lead for the balance", () => {
    render(<SignupCheckoutScreen account="signed-in" table={buildSignupBasketTable("INR", "razorpay", { "social-media": false })} initialServices={["managed-website", "social-media"]} link={link} standalone={false} />);
    expect(screen.getByText("Your website is ready. Review what you pay today.")).toBeTruthy();
    expect(screen.queryByText(/Choose the services you want/)).toBeNull();
    expect(screen.queryByText("One-time build fee")).toBeNull();
    expect(screen.queryByText("What happens next")).toBeNull();
    expect(screen.queryByText("Book your kickoff call")).toBeNull();
  });
});
