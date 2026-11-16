import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DROPPED_ACTION_MESSAGE } from "@brandbasket/shared/lib/guard-action";
import type { ActionResult } from "@/lib/action-result";
import { CreateForm } from "./blog/components/create-form";
import { CodeForm } from "./checkout/components/code-form";
import { EnquiryForm } from "./enquiries/components/enquiry-form";
import { SignInForm } from "./entry/components/sign-in-form";
import { MoveDomainForm } from "./website/domain/components/move-domain-form";

const dropped = vi.hoisted(() =>
  vi.fn(async (): Promise<ActionResult> => {
    throw new TypeError("Failed to fetch");
  }),
);

vi.mock("./checkout/actions", () => ({ applyCodeAction: dropped, removeCodeAction: dropped }));
vi.mock("./enquiries/actions", () => ({ saveEnquiryAction: dropped, renameChatbotAction: dropped }));
vi.mock("./entry/actions", () => ({ signInAction: dropped }));
vi.mock("./website/domain/actions", () => ({ requestOwnDomainAction: dropped, checkDomainAction: dropped }));

/** Each adopted form family: a request that never gets an answer keeps what was typed and says what to do. */
async function expectKeepsInput(ui: ReactElement, field: string, typed: string): Promise<void> {
  render(ui);
  const input = screen.getByLabelText(field, { exact: false });
  await userEvent.clear(input);
  await userEvent.type(input, typed);
  const submit = screen.getAllByRole("button").find((button) => (button as HTMLButtonElement).type === "submit");
  if (submit === undefined) throw new Error("The form has no submit button.");
  await userEvent.click(submit);
  expect((await screen.findByText(DROPPED_ACTION_MESSAGE)).textContent).toBe(DROPPED_ACTION_MESSAGE);
  expect((screen.getByLabelText(field, { exact: false }) as HTMLInputElement).value).toBe(typed);
}

describe("forms keep input when the request is dropped", () => {
  beforeEach(() => {
    dropped.mockClear();
  });

  it("blog create form", async () => {
    const action = vi.fn(async (): Promise<ActionResult> => {
      throw new TypeError("Failed to fetch");
    });
    await expectKeepsInput(
      <CreateForm title="New post" field={{ name: "title", label: "Post title", hint: "Short.", maxLength: 100 }} submitLabel="Create post" action={action} />,
      "Post title",
      "Spring offer",
    );
  });

  it("checkout code form", async () => {
    await expectKeepsInput(<CodeForm services={["website"]} code={null} lapsedCode={null} />, "code", "FRIEND10");
  });

  it("enquiry form", async () => {
    await expectKeepsInput(<EnquiryForm row={{ id: "e1", note: null, status: "new" } as never} />, "Private note", "Called back, wants a quote");
  });

  it("sign-in form", async () => {
    await expectKeepsInput(<SignInForm siteKey={null} />, "Email or mobile number", "asha@example.com");
  });

  it("move domain form", async () => {
    await expectKeepsInput(<MoveDomainForm />, "Your domain", "asha.example.com");
  });
});
