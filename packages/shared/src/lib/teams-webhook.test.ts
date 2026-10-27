import { describe, expect, it } from "vitest";
import { isTeamsDestination, readTeamsWebhookUrl, teamsCard, teamsSettingKey, TEAMS_DESTINATIONS } from "./teams-webhook";

const WORKFLOWS = "https://prod-12.centralindia.logic.azure.com:443/workflows/abc123/triggers/manual/paths/invoke?api-version=2016-06-01&sig=secret";

describe("readTeamsWebhookUrl", () => {
  it("keeps a Workflows address and an older Office connector address", () => {
    // Stored the way the browser writes it: the default :443 is dropped.
    expect(readTeamsWebhookUrl(`  ${WORKFLOWS}  `)).toEqual({ ok: true, url: WORKFLOWS.replace(":443", "") });
    expect(readTeamsWebhookUrl("https://acme.webhook.office.com/webhookb2/x/IncomingWebhook/y/z")).toMatchObject({ ok: true });
    expect(readTeamsWebhookUrl("https://x.environment.api.powerplatform.com/powerautomate/automations/direct/workflows/1/triggers/manual/paths/invoke?sig=1")).toMatchObject({ ok: true });
  });

  it("treats nothing typed as removing the address", () => {
    expect(readTeamsWebhookUrl("   ")).toEqual({ ok: true, url: null });
  });

  it("refuses an address that is not https, not a web address, or carries a login", () => {
    expect(readTeamsWebhookUrl("http://prod-1.logic.azure.com/x")).toEqual({ ok: false, problem: "teams-not-secure" });
    expect(readTeamsWebhookUrl("javascript:alert(1)")).toEqual({ ok: false, problem: "teams-not-a-web-address" });
    expect(readTeamsWebhookUrl("not a url")).toEqual({ ok: false, problem: "teams-not-a-web-address" });
    expect(readTeamsWebhookUrl("https://user:pw@prod-1.logic.azure.com/x")).toEqual({ ok: false, problem: "teams-has-a-login" });
    expect(readTeamsWebhookUrl(`https://prod-1.logic.azure.com/${"a".repeat(1_000)}`)).toEqual({ ok: false, problem: "teams-too-long" });
  });

  it("refuses any host that Teams webhooks do not live on, so the server cannot be pointed at another site", () => {
    for (const address of [
      "https://example.com/hook",
      "https://localhost/hook",
      "https://10.0.0.5/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://logic.azure.com.evil.example/x",
      "https://evil-logic.azure.com.attacker.test/x",
      "https://logic.azure.com/x",
    ]) {
      expect(readTeamsWebhookUrl(address), address).toEqual({ ok: false, problem: "teams-not-a-teams-address" });
    }
  });
});

describe("destinations", () => {
  it("names a setting for each destination and recognises only those", () => {
    expect(TEAMS_DESTINATIONS.map(teamsSettingKey)).toEqual(["teams_webhook_enquiries", "teams_webhook_payments", "teams_webhook_support", "teams_webhook_system"]);
    expect(isTeamsDestination("support")).toBe(true);
    expect(isTeamsDestination("billing")).toBe(false);
    expect(isTeamsDestination(undefined)).toBe(false);
  });
});

describe("teamsCard", () => {
  const content = (message: ReturnType<typeof teamsCard>): Record<string, unknown> => message.attachments[0].content;

  it("wraps one Adaptive Card in the message a Workflows webhook expects", () => {
    const message = teamsCard({ title: "New enquiry: Rao Clinic", subtitle: "Website enquiries", facts: [{ name: "Email", value: "asha@example.com" }], text: "Please call me.", open: { label: "Open the lead", url: "https://console.example/leads/1" } });
    expect(message.type).toBe("message");
    expect(message.attachments[0].contentType).toBe("application/vnd.microsoft.card.adaptive");
    expect(content(message)).toMatchObject({
      type: "AdaptiveCard",
      version: "1.4",
      body: [
        { type: "TextBlock", text: "New enquiry: Rao Clinic", weight: "Bolder" },
        { type: "TextBlock", text: "Website enquiries", isSubtle: true },
        { type: "FactSet", facts: [{ title: "Email", value: "asha@example.com" }] },
        { type: "TextBlock", text: "Please call me." },
      ],
      actions: [{ type: "Action.OpenUrl", title: "Open the lead", url: "https://console.example/leads/1" }],
    });
  });

  it("leaves out whatever is empty", () => {
    const body = content(teamsCard({ title: "T", facts: [{ name: "Phone", value: "  " }, { name: "Email", value: undefined }], text: " ", open: null })).body as unknown[];
    expect(body).toHaveLength(1);
    expect(content(teamsCard({ title: "T" }))).not.toHaveProperty("actions");
  });

  it("clips long text so a card never goes over what Teams accepts", () => {
    const body = content(teamsCard({ title: "T", text: "x".repeat(5_000), facts: [{ name: "Message", value: "y".repeat(900) }] })).body as { text?: string; facts?: { value: string }[] }[];
    expect(body[2]?.text).toHaveLength(1_500);
    expect(body[1]?.facts?.[0]?.value).toHaveLength(300);
  });
});
