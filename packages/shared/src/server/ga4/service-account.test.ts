import { createVerify, generateKeyPairSync } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createTokenSource, loadServiceAccount, ServiceAccountError, signAssertion, type ServiceAccount } from "./service-account";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
const account: ServiceAccount = { type: "service_account", client_email: "reader@brandbasket-test.iam.gserviceaccount.com", private_key: privateKey, token_uri: "https://oauth2.googleapis.com/token" };
const NOW = new Date("2026-11-03T00:00:00.000Z");

describe("signAssertion", () => {
  it("is a verifiable RS256 token naming the account, the read-only scope and a one hour life", () => {
    const [header, claims, signature] = signAssertion(account, NOW).split(".");
    expect(JSON.parse(Buffer.from(header ?? "", "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(claims ?? "", "base64url").toString())).toEqual({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: account.token_uri,
      iat: 1_793_664_000,
      exp: 1_793_667_600,
    });
    expect(createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature ?? "", "base64url"))).toBe(true);
  });
});

describe("createTokenSource", () => {
  it("asks Google once and reuses the token until a minute before it ends", async () => {
    const fetchFn = vi.fn(async () => Response.json({ access_token: "tok-1", expires_in: 3600 }));
    let now = NOW;
    const token = createTokenSource(account, { fetch: fetchFn as never, now: () => now });
    expect(await token()).toBe("tok-1");
    now = new Date(NOW.getTime() + 3000_000);
    expect(await token()).toBe("tok-1");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    now = new Date(NOW.getTime() + 3560_000);
    await token();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("fails with the status and without the key when Google refuses", async () => {
    const token = createTokenSource(account, { fetch: (async () => new Response("no", { status: 400 })) as never, now: () => NOW });
    await expect(token()).rejects.toThrow("HTTP 400");
  });
});

describe("loadServiceAccount", () => {
  it("reads a key file and fills the token address", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ga4-"));
    const path = join(dir, "key.json");
    await writeFile(path, JSON.stringify({ type: "service_account", client_email: account.client_email, private_key: privateKey }));
    expect(await loadServiceAccount(path)).toMatchObject({ client_email: account.client_email, token_uri: "https://oauth2.googleapis.com/token" });
  });

  it("names the problem, never the key, when it is unset, missing, not JSON or not a service account", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ga4-"));
    const notJson = join(dir, "a.json");
    const wrong = join(dir, "b.json");
    await writeFile(notJson, "nope");
    await writeFile(wrong, JSON.stringify({ type: "authorized_user", private_key: privateKey }));
    await expect(loadServiceAccount(undefined)).rejects.toThrow("GA4_SERVICE_ACCOUNT_JSON is not set");
    await expect(loadServiceAccount(join(dir, "missing.json"))).rejects.toThrow("cannot be read");
    await expect(loadServiceAccount(notJson)).rejects.toThrow("not JSON");
    const error = await loadServiceAccount(wrong).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServiceAccountError);
    expect((error as Error).message).not.toContain("PRIVATE KEY");
  });
});
