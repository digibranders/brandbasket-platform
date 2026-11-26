import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupCheckoutScreen } from "@/features/checkout/components/signup-checkout-screen";
import { buildSignupBasketTable } from "@/features/checkout/rules/signup-basket";
import { AuthFrame } from "@/features/entry/components/auth-frame";
import { SignUpForm } from "@/features/entry/components/sign-up-form";
import { signedInEntry, unpaidSignupOwner } from "@/features/entry/server/entry-access";
import { loadSignupCheckoutBasket, loadSignupCheckoutBasketFor } from "@/features/entry/server/signup-checkout-basket";
import SignUpPage from "./page";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/checkout/components/signup-checkout-screen", () => ({ SignupCheckoutScreen: () => null }));
vi.mock("@/features/entry/components/auth-frame", () => ({ AuthFrame: () => null }));
vi.mock("@/features/entry/components/sign-up-form", () => ({ SignUpForm: () => null }));
vi.mock("@/features/entry/components/no-business", () => ({ NoBusiness: () => null }));
vi.mock("@/features/entry/server/env", () => ({ emailCodeBypassed: () => false, leadsApiToken: () => null }));
vi.mock("@/features/entry/server/entry-access", () => ({ signedInEntry: vi.fn(), unpaidSignupOwner: vi.fn() }));
vi.mock("@/features/entry/server/pending-signup-cookie", () => ({ getPendingSignupCookie: vi.fn(async () => null) }));
vi.mock("@/features/entry/server/signup-prices", () => ({ loadSignUpBasket: vi.fn(async () => ({ name: "Website Management", prices: { INR: null, USD: null } })) }));
vi.mock("@/features/entry/server/signup-checkout-basket", () => ({ loadSignupCheckoutBasket: vi.fn(), loadSignupCheckoutBasketFor: vi.fn() }));

/** Every element in a returned tree, whatever its depth. */
function elementsOf(node: ReactNode): ReactElement[] {
  if (!isValidElement(node)) return [];
  const { children } = node.props as { readonly children?: ReactNode };
  return [node, ...(Array.isArray(children) ? children.flatMap(elementsOf) : elementsOf(children))];
}
/** The 43-character token an invitation link carries. */
const INVITE = `/invite/${"A".repeat(43)}`;
const typesIn = (node: ReactNode): unknown[] => elementsOf(node).map((element) => element.type);

beforeEach(() => {
  vi.mocked(redirect).mockReset();
  vi.mocked(signedInEntry).mockReset().mockResolvedValue(null);
  vi.mocked(unpaidSignupOwner).mockReset().mockResolvedValue(null);
  vi.mocked(loadSignupCheckoutBasketFor).mockReset().mockReturnValue(buildSignupBasketTable("USD", "razorpay"));
  vi.mocked(headers).mockResolvedValue(new Headers({ "cf-ipcountry": "IN" }));
  vi.mocked(loadSignupCheckoutBasket).mockReset().mockReturnValue(buildSignupBasketTable("INR", "razorpay"));
});

describe("the sign-up page", () => {
  it("shows a new visitor the one-screen checkout, on the services the link names", async () => {
    const page = await SignUpPage({ searchParams: Promise.resolve({ plan: "website,social" }) });
    expect(isValidElement(page) && page.type).toBe(SignupCheckoutScreen);
    expect((page as ReactElement<{ initialServices: readonly string[] }>).props.initialServices).toEqual(["managed-website", "social-media"]);
    expect(typesIn(page)).not.toContain(SignUpForm);
  });

  it("prices a visitor outside India in dollars, by the country the edge reports", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "cf-ipcountry": "AE" }));
    await SignUpPage({ searchParams: Promise.resolve({}) });
    expect(loadSignupCheckoutBasket).toHaveBeenCalledWith("AE");
  });

  it("keeps today's account form, in its frame, for a teammate sent from an invitation", async () => {
    const page = await SignUpPage({ searchParams: Promise.resolve({ next: INVITE }) });
    expect(isValidElement(page) && page.type).toBe(AuthFrame);
    expect(typesIn(page)).toContain(SignUpForm);
    expect(typesIn(page)).not.toContain(SignupCheckoutScreen);
    expect(loadSignupCheckoutBasket).not.toHaveBeenCalled();
    const form = elementsOf(page).find((element) => element.type === SignUpForm) as ReactElement<{ next: string | null }>;
    expect(form.props.next).toBe(INVITE);
  });

  it("shows a new visitor the screen in its new-account mode", async () => {
    const page = (await SignUpPage({ searchParams: Promise.resolve({}) })) as ReactElement<{ account: string }>;
    expect(page.props.account).toBe("new");
  });

  describe("for someone already signed in", () => {
    beforeEach(() => {
      vi.mocked(signedInEntry).mockResolvedValue({ kind: "elsewhere", href: "/checkout" });
    });

    it("shows a signed-in owner whose sign-up has not paid the same screen in its signed-in mode, priced in the business's currency", async () => {
      vi.mocked(unpaidSignupOwner).mockResolvedValue({ currency: "USD", savedServices: ["social-media"] });
      const page = (await SignUpPage({ searchParams: Promise.resolve({ plan: "website" }) })) as ReactElement<{ account: string; initialServices: readonly string[]; table: { currency: string } }>;
      expect(page.type).toBe(SignupCheckoutScreen);
      expect(page.props).toMatchObject({ account: "signed-in", initialServices: ["managed-website"] });
      expect(page.props.table.currency).toBe("USD");
      expect(loadSignupCheckoutBasketFor).toHaveBeenCalledWith("USD");
      expect(loadSignupCheckoutBasket).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it("opens on the basket the questions were last asked for when the link names none, else on nothing", async () => {
      vi.mocked(unpaidSignupOwner).mockResolvedValue({ currency: "INR", savedServices: ["social-media"] });
      expect(((await SignUpPage({ searchParams: Promise.resolve({}) })) as ReactElement<{ initialServices: readonly string[] }>).props.initialServices).toEqual(["social-media"]);
      vi.mocked(unpaidSignupOwner).mockResolvedValue({ currency: "INR", savedServices: [] });
      expect(((await SignUpPage({ searchParams: Promise.resolve({}) })) as ReactElement<{ initialServices: readonly string[] }>).props.initialServices).toEqual([]);
    });

    it("still sends a paid member, a team member or anyone else signed in to their workspace", async () => {
      await SignUpPage({ searchParams: Promise.resolve({ plan: "website" }) });
      expect(unpaidSignupOwner).toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith("/checkout");
    });

    it("sends an unpaid owner who follows an invitation where they were going, as before", async () => {
      vi.mocked(unpaidSignupOwner).mockResolvedValue({ currency: "INR", savedServices: [] });
      await SignUpPage({ searchParams: Promise.resolve({ next: INVITE }) });
      expect(unpaidSignupOwner).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith("/checkout");
    });
  });
});
