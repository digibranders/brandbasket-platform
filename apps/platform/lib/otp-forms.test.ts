import { isValidElement, type ReactElement, type ReactNode } from "react";
import { BRAND } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
import { legalLinksFor } from "./legal-links";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JoinForm } from "@/components/panel/join-form";
import { ForgotPasswordForm } from "@/components/panel/forgot-password-form";
import { VerifyBusiness } from "@/components/panel/business/verify-business";
import type { JoinFormState } from "@/lib/join-form";
import type { ForgotPasswordFormState } from "@/lib/account-recovery-form";
import type { VerifyBusinessState } from "@/lib/verify-business-form";

const harness = vi.hoisted(() => ({
  state: undefined as unknown,
  pending: false,
  values: [] as unknown[],
  index: 0,
  events: [] as string[],
  challengeId: null as string | null,
  onCode: null as ((otpId: string, code: string) => void) | null,
  submit: null as ((data: FormData) => Promise<unknown>) | null,
}));

vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useActionState: <T,>(action: (state: T, data: FormData) => Promise<T>, initial: T) => {
    const state = (harness.state === undefined ? initial : harness.state) as T;
    harness.submit = async (data) => {
      const result = await action(state, data);
      harness.state = result;
      return result;
    };
    return [state, harness.submit, harness.pending];
  },
  useState: <T,>(initial: T) => {
    const index = harness.index++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index] as T, (value: T | ((previous: T) => T)) => {
      harness.values[index] = typeof value === "function"
        ? (value as (previous: T) => T)(harness.values[index] as T)
        : value;
    }];
  },
  useRef: () => ({ current: null }),
  useEffect: () => undefined,
}));

vi.mock("@/lib/use-sms-otp-autofill", () => ({
  useSmsOtpAutofill: (onCode: (otpId: string, code: string) => void) => {
    harness.onCode = onCode;
    return {
      receive: async <T,>(send: () => Promise<T>, challengeId: (result: T) => string | null): Promise<T> => {
        harness.events.push("receive");
        const result = await send();
        harness.challengeId = challengeId(result);
        return result;
      },
      cancel: () => { harness.events.push("cancel"); },
    };
  },
}));

interface ElementProps {
  readonly children?: ReactNode;
  readonly id?: string;
  readonly name?: string;
  readonly value?: string;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly autoComplete?: string;
  readonly rule?: string;
  readonly onChange?: (event: { target: { value: string } }) => void;
  readonly onClick?: () => void;
  readonly onBack?: () => void;
}

function elements(node: ReactNode): ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function input(tree: ReactElement, id: string): ReactElement<ElementProps> {
  const element = elements(tree).find((candidate) => candidate.props.id === id);
  if (!element) throw new Error(`Missing input ${id}`);
  return element;
}

function render(component: () => ReactElement): ReactElement {
  harness.index = 0;
  return component();
}

async function submit(data = new FormData()): Promise<unknown> {
  if (!harness.submit) throw new Error("No form action was registered");
  return harness.submit(data);
}

function receiveCode(otpId: string, code: string): void {
  if (!harness.onCode) throw new Error("No SMS receiver was registered");
  harness.onCode(otpId, code);
}

const otp = { otpId: "challenge-1", phoneHint: "••••1234", via: "phone" as const, texted: true };

function join(action: (state: JoinFormState, data: FormData) => Promise<JoinFormState>, textsCodes = true): ReactElement {
  return JoinForm({ action, listing: null, placeId: null, businessName: "", signature: "", initialChoice: "care", preselected: null, choices: LISTING_BRAND.joinChoices, legalLinks: legalLinksFor(BRAND), prices: { care: null, premium: null }, signUpWith: "phone", textsCodes });
}

beforeEach(() => {
  harness.state = undefined;
  harness.pending = false;
  harness.values = [];
  harness.index = 0;
  harness.events = [];
  harness.challengeId = null;
  harness.onCode = null;
  harness.submit = null;
});

describe("signup SMS autofill integration", () => {
  it("starts receiving before send and binds only a successful texted challenge", async () => {
    render(() => join(async () => {
      harness.events.push("send");
      return { status: "code", otp };
    }));
    await submit();
    expect(harness.events).toEqual(["receive", "send"]);
    expect(harness.challengeId).toBe(otp.otpId);
  });

  it.each([false, true])("does not bind bypassed or failed signup sends (bypass=%s)", async (bypass) => {
    render(() => join(async () => bypass
      ? { status: "code", otp: { ...otp, texted: false } }
      : { status: "error", message: "Send failed", otp }));
    await submit();
    expect(harness.events).toEqual(["receive"]);
    expect(harness.challengeId).toBeNull();
  });

  it("does not receive while signup texting is disabled", async () => {
    render(() => join(async () => ({ status: "code", otp: { ...otp, texted: false } }), false));
    await submit();
    expect(harness.events).not.toContain("receive");
  });

  it("fills a leading-zero code without submitting and preserves partial manual entry", () => {
    const action = vi.fn(async (): Promise<JoinFormState> => ({ status: "code", otp }));
    harness.state = { status: "code", otp };
    const component = () => join(action);
    render(component);
    receiveCode(otp.otpId, "012345");
    let tree = render(component);
    expect(input(tree, "join-code").props.value).toBe("012345");
    expect(action).not.toHaveBeenCalled();
    input(tree, "join-code").props.onChange?.({ target: { value: "09" } });
    receiveCode(otp.otpId, "987654");
    tree = render(component);
    expect(input(tree, "join-code").props.value).toBe("09");
    expect(harness.events).toContain("cancel");
    expect(input(tree, "join-code").props.autoComplete).toBe("one-time-code");
    expect(input(tree, "join-code").props.rule).toBe("digits");
  });

  it("resends with a fresh receiver and cancels before confirmation", async () => {
    harness.state = { status: "code", otp };
    const component = () => join(async () => { harness.events.push("send"); return { status: "code", otp }; });
    render(component);
    const resend = new FormData();
    resend.set("otpId", otp.otpId);
    resend.set("resend", "1");
    await submit(resend);
    expect(harness.events).toEqual(["receive", "send"]);
    harness.events = [];
    render(component);
    const confirm = new FormData();
    confirm.set("otpId", otp.otpId);
    confirm.set("code", "012345");
    await submit(confirm);
    expect(harness.events).toEqual(["cancel", "send"]);
  });

  it("locks identity fields and backward controls during a send", () => {
    harness.pending = true;
    const tree = render(() => join(async () => ({ status: "code", otp })));
    for (const id of ["join-business-name", "join-name", "join-phone", "join-password"]) {
      expect(input(tree, id).props.readOnly).toBe(true);
      expect(input(tree, id).props.disabled).not.toBe(true);
    }
    expect(elements(tree).find((element) => element.props.onBack)?.props.disabled).toBe(true);
  });

  it("cancels when changing the number and locks that control during a resend", () => {
    harness.state = { status: "code", otp };
    const component = () => join(async () => ({ status: "code", otp }));
    let tree = render(component);
    const change = elements(tree).find((element) => element.props.children === "Change number");
    change?.props.onClick?.();
    expect(harness.events).toContain("cancel");
    tree = render(component);
    expect(elements(tree).some((element) => element.props.id === "join-phone")).toBe(true);
    harness.values = [];
    harness.pending = true;
    tree = render(component);
    expect(elements(tree).find((element) => element.props.children === "Change number")?.props.disabled).toBe(true);
  });
});

describe("password recovery SMS autofill integration", () => {
  it.each(["9820000000", "owner@example.com"])("receives only mobile sends for %s", async (identifier) => {
    const action = async (): Promise<ForgotPasswordFormState> => {
      harness.events.push("send");
      return identifier.includes("@") ? { status: "sent", email: identifier } : { status: "code", otp };
    };
    const tree = render(() => ForgotPasswordForm({ action }));
    input(tree, "forgot-identifier").props.onChange?.({ target: { value: identifier } });
    render(() => ForgotPasswordForm({ action }));
    harness.events = [];
    const data = new FormData();
    data.set("identifier", identifier);
    await submit(data);
    expect(harness.events).toEqual(identifier.includes("@") ? ["cancel", "send"] : ["receive", "send"]);
    expect(harness.challengeId).toBe(identifier.includes("@") ? null : otp.otpId);
  });

  it("fills only the code and keeps password confirmation explicit", () => {
    harness.state = { status: "code", otp };
    const action = vi.fn(async (): Promise<ForgotPasswordFormState> => ({ status: "code", otp }));
    const component = () => ForgotPasswordForm({ action });
    render(component);
    receiveCode(otp.otpId, "012345");
    const tree = render(component);
    expect(input(tree, "forgot-code").props.value).toBe("012345");
    expect(input(tree, "forgot-new-password").props.value).toBe("");
    expect(input(tree, "forgot-confirm-password").props.value).toBe("");
    expect(action).not.toHaveBeenCalled();
  });

  it("preserves manual codes and cancels before confirmation", async () => {
    harness.state = { status: "code", otp };
    const component = () => ForgotPasswordForm({ action: async () => {
      harness.events.push("send");
      return { status: "code", otp };
    } });
    const tree = render(component);
    input(tree, "forgot-code").props.onChange?.({ target: { value: "09" } });
    receiveCode(otp.otpId, "012345");
    expect(input(render(component), "forgot-code").props.value).toBe("09");
    harness.events = [];
    const data = new FormData();
    data.set("identifier", "9820000000");
    data.set("otpId", otp.otpId);
    await submit(data);
    expect(harness.events).toEqual(["cancel", "send"]);
  });

  it("resends with a fresh receiver and clears the previous challenge's code", async () => {
    harness.state = { status: "code", otp };
    const component = () => ForgotPasswordForm({ action: async () => {
      harness.events.push("send");
      return { status: "code", otp: { ...otp, otpId: "challenge-2" } };
    } });
    render(component);
    receiveCode(otp.otpId, "012345");
    render(component);
    harness.events = [];
    const data = new FormData();
    data.set("identifier", "9820000000");
    data.set("otpId", otp.otpId);
    data.set("resend", "1");
    await submit(data);
    expect(harness.events).toEqual(["receive", "send"]);
    expect(harness.challengeId).toBe("challenge-2");
    expect(input(render(component), "forgot-code").props.value).toBe("");
  });

  it("does not bind failed mobile sends even when the old challenge is retained", async () => {
    render(() => ForgotPasswordForm({ action: async () => ({ status: "error", message: "Send failed", otp }) }));
    const data = new FormData();
    data.set("identifier", "9820000000");
    await submit(data);
    expect(harness.events).toEqual(["receive"]);
    expect(harness.challengeId).toBeNull();
  });

  it("cancels changing the number and prevents that change during pending sends", () => {
    harness.state = { status: "code", otp };
    const component = () => ForgotPasswordForm({ action: async () => ({ status: "code", otp }) });
    harness.pending = true;
    let tree = render(component);
    let change = elements(tree).find((element) => element.props.children === "Change number");
    expect(change?.props.disabled).toBe(true);
    change?.props.onClick?.();
    expect(harness.events).toEqual([]);
    expect(elements(render(component)).some((element) => element.props.id === "forgot-code")).toBe(true);
    harness.pending = false;
    tree = render(component);
    change = elements(tree).find((element) => element.props.children === "Change number");
    change?.props.onClick?.();
    expect(harness.events).toEqual(["cancel"]);
    expect(elements(render(component)).some((element) => element.props.id === "forgot-identifier")).toBe(true);
  });

  it("locks the identity input while pending", () => {
    harness.pending = true;
    const tree = render(() => ForgotPasswordForm({ action: async () => ({ status: "idle" }) }));
    expect(input(tree, "forgot-identifier").props.readOnly).toBe(true);
  });
});

describe("business verification SMS autofill integration", () => {
  it.each([true, false])("starts before send and binds only texted business challenges (texted=%s)", async (texted) => {
    render(() => VerifyBusiness({ phoneHint: otp.phoneHint, action: async () => {
      harness.events.push("send");
      return { status: "sent", ...otp, texted };
    } }));
    await submit();
    expect(harness.events).toEqual(["receive", "send"]);
    expect(harness.challengeId).toBe(texted ? otp.otpId : null);
  });

  it("does not bind a failed verification send", async () => {
    render(() => VerifyBusiness({ phoneHint: otp.phoneHint, action: async () => ({ status: "error", message: "Send failed", step: "send" }) }));
    await submit();
    expect(harness.events).toEqual(["receive"]);
    expect(harness.challengeId).toBeNull();
  });

  it("keeps codes controlled per challenge, preserves manual entry, and cancels confirmation", async () => {
    harness.state = { status: "sent", ...otp };
    const action = vi.fn(async (): Promise<VerifyBusinessState> => { harness.events.push("send"); return { status: "sent", ...otp }; });
    const component = () => VerifyBusiness({ action, phoneHint: otp.phoneHint });
    render(component);
    receiveCode(otp.otpId, "012345");
    let tree = render(component);
    expect(input(tree, "verify-code").props.value).toBe("012345");
    expect(action).not.toHaveBeenCalled();
    input(tree, "verify-code").props.onChange?.({ target: { value: "09" } });
    receiveCode(otp.otpId, "987654");
    tree = render(component);
    expect(input(tree, "verify-code").props.value).toBe("09");
    harness.state = { status: "sent", ...otp, otpId: "challenge-2" };
    tree = render(component);
    expect(input(tree, "verify-code").props.value).toBe("");
    harness.events = [];
    const data = new FormData();
    data.set("otpId", "challenge-2");
    await submit(data);
    expect(harness.events).toEqual(["cancel", "send"]);
  });
});
