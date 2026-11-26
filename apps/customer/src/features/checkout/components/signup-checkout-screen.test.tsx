import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startSignupCheckoutAction, type CheckoutSignupResult } from "@/features/entry/actions";
import { CHECKOUT_ACCOUNT_EXISTS_MESSAGE, CHECKOUT_AGREE_MESSAGE } from "@/features/entry/rules/checkout-signup-messages";
import type { ActionResult } from "@/lib/action-result";
import { startPaymentAction } from "../actions";
import { buildSignupBasketTable, type SignupBasketTable } from "../rules/signup-basket";
import { SignupCheckoutScreen } from "./signup-checkout-screen";

vi.mock("@/features/entry/actions", () => ({ startSignupCheckoutAction: vi.fn() }));
vi.mock("../actions", () => ({ startPaymentAction: vi.fn() }));

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
    expect(summary().getByText("₹3,000")).toBeTruthy();
    expect(payButtons().map((button) => button.textContent)).toEqual(["Pay ₹3,000", "Pay ₹3,000"]);
  });

  it("changes the rows and the total when a card is toggled", async () => {
    screenWith(INDIA);
    expect(summary().getByText("Maintenance")).toBeTruthy();
    expect(summary().queryByText("Social Media Management, first month")).toBeNull();
    expect(payButtons()[0]?.textContent).toContain("Pay ₹2,999");

    await userEvent.click(card("Social Media Management"));
    expect(summary().getByText("Social Media Management, first month")).toBeTruthy();
    expect(payButtons()[0]?.textContent).toContain("Pay ₹3,000");

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
    expect(payButtons()[0]?.textContent).toContain("Pay ₹64,778");
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
    expect(summary().getByText("$60")).toBeTruthy();
    expect(screen.queryByText("State")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "My business has a GSTIN" })).toBeNull();
    expect(screen.getByText("Choose the services you want. Prices are in dollars.")).toBeTruthy();

    await userEvent.click(screen.getByRole("combobox", { name: /Country code/ }));
    await userEvent.click(await screen.findByRole("option", { name: "India +91" }));
    expect(screen.queryByText("State")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "My business has a GSTIN" })).toBeNull();
    expect(summary().getByText("$60")).toBeTruthy();
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
    expect([...payment.keys()].sort()).toEqual(["billing", "service", "service", "tier"]);
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
    expect(payButtons().map((button) => button.textContent)).toEqual(["Pay ₹3,000", "Pay ₹3,000"]);
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
    expect([...payment.keys()].sort()).toEqual(["billing", "service", "service", "tier"]);
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
