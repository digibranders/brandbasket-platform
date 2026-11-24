import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConfirmSubmit } from "./confirm-submit";

describe("ConfirmSubmit", () => {
  it("is one submit button until the confirm is opened, with no dialog in the page", () => {
    const html = renderToStaticMarkup(
      <form>
        <ConfirmSubmit copy={{ title: "Send the preview", consequence: "The customer is emailed.", confirmLabel: "Send preview" }} className="btn">
          Send preview
        </ConfirmSubmit>
      </form>,
    );
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Send preview</button>");
    expect(html).not.toContain("<dialog");
    expect(html).not.toContain("Keep");
  });

  it("passes formNoValidate through", () => {
    const html = renderToStaticMarkup(
      <form>
        <ConfirmSubmit copy={{ title: "t", consequence: "c", confirmLabel: "ok" }} className="btn" formNoValidate>
          Go
        </ConfirmSubmit>
      </form>,
    );
    expect(html).toContain("formNoValidate");
  });
});
