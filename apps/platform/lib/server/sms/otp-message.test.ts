import { describe, expect, it, vi } from "vitest";
import { otpCodeOf, otpMessage } from "./otp-message";

vi.mock("server-only", () => ({}));

describe("otpMessage", () => {
  it("renders the one fixed DLT template with only the code substituted", () => {
    expect(otpMessage("004821")).toBe("004821 is your Fynix code. It expires in 10 minutes. Do not share it.");
  });

  it("adds a final fixed-host binding with the same leading-zero code", () => {
    expect(otpMessage("004821", "app.fynix.digital")).toBe(
      "004821 is your Fynix code. It expires in 10 minutes. Do not share it.\n\n@app.fynix.digital #004821 Fynix",
    );
  });

  it.each(["48291", "1234567", "１２３４５６", "123456\n", " 123456"])("refuses invalid code %j", (code) => {
    expect(() => otpMessage(code)).toThrow(/six ASCII digits/);
  });

  it.each(["https://app.fynix.digital", "app.fynix.digital:443", "app.fynix.digital/path", "app.fynix.digital\n@evil.test", "localhost", "127.0.0.1", "[::1]", "app..fynix.digital", "-app.fynix.digital", "APP.fynix.digital", "app.fynix.digital."])("refuses malformed binding host %j", (host) => {
    expect(() => otpMessage("004821", host)).toThrow(/DNS host/);
  });
});

describe("otpCodeOf", () => {
  it("reads the code back out of the rendered text", () => {
    expect(otpCodeOf(otpMessage("004821"))).toBe("004821");
  });

  it("returns null for any other text", () => {
    expect(otpCodeOf("004821 is your code. Send money.")).toBeNull();
    expect(otpCodeOf("004821 is your code to book with Smile Dental. It expires in 10 minutes. Do not share it.")).toBeNull();
    expect(otpCodeOf(`${otpMessage("004821")} Extra words.`)).toBeNull();
    expect(otpCodeOf("48291 is your Fynix code. It expires in 10 minutes. Do not share it.")).toBeNull();
  });

  it("reads a matching domain-bound code", () => {
    expect(otpCodeOf("004821 is your Fynix code. It expires in 10 minutes. Do not share it.\n\n@app.fynix.digital #004821 Fynix")).toBe("004821");
  });

  it.each([
    "\n\n@app.fynix.digital #123456 Fynix",
    "\n\n@app.fynix.digital #004821 Fynix\n",
    "\n\n@app.fynix.digital #004821 Fynix\nExtra",
    "\n\n@app.fynix.digital #004821",
    "\n\n@app.fynix.digital/path #004821 Fynix",
    "\n\n@127.0.0.1 #004821 Fynix",
    "\n\n@app.fynix.digital #004821 Fynix @evil.test",
  ])("refuses unregistered binding text %j", (suffix) => {
    expect(otpCodeOf(`004821 is your Fynix code. It expires in 10 minutes. Do not share it.${suffix}`)).toBeNull();
  });

  it("refuses a trailing newline on legacy text", () => {
    expect(otpCodeOf(`${otpMessage("004821")}\n`)).toBeNull();
  });
});

describe("a text worded for another brand", () => {
  it("says that brand's name where the registered text says Fynix", () => {
    expect(otpMessage("004821", undefined, "Acme")).toBe("004821 is your Acme code. It expires in 10 minutes. Do not share it.");
    expect(otpMessage("004821", "app.fynix.test", "Acme")).toBe(
      "004821 is your Acme code. It expires in 10 minutes. Do not share it.\n\n@app.fynix.test #004821 Acme",
    );
  });

  it("leaves the registered Fynix text exactly as it was", () => {
    expect(otpMessage("004821", undefined, "Fynix")).toBe(otpMessage("004821"));
  });

  it("is not a registered shape, so it can never be read back for sending until its own template exists", () => {
    expect(otpCodeOf(otpMessage("004821", undefined, "Acme"))).toBeNull();
  });
});
