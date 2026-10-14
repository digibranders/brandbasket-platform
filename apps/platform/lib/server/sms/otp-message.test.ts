import { describe, expect, it, vi } from "vitest";
import { otpCodeOf, otpMessage } from "./otp-message";

vi.mock("server-only", () => ({}));

describe("otpMessage", () => {
  it("renders the one fixed DLT template with only the code substituted", () => {
    expect(otpMessage("004821")).toBe("004821 is your Firstfold code. It expires in 10 minutes. Do not share it.");
  });

  it("adds a final fixed-host binding with the same leading-zero code", () => {
    expect(otpMessage("004821", "app.firstfold.io")).toBe(
      "004821 is your Firstfold code. It expires in 10 minutes. Do not share it.\n\n@app.firstfold.io #004821 Firstfold",
    );
  });

  it.each(["48291", "1234567", "１２３４５６", "123456\n", " 123456"])("refuses invalid code %j", (code) => {
    expect(() => otpMessage(code)).toThrow(/six ASCII digits/);
  });

  it.each(["https://app.firstfold.io", "app.firstfold.io:443", "app.firstfold.io/path", "app.firstfold.io\n@evil.test", "localhost", "127.0.0.1", "[::1]", "app..firstfold.io", "-app.firstfold.io", "APP.firstfold.io", "app.firstfold.io."])("refuses malformed binding host %j", (host) => {
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
    expect(otpCodeOf("48291 is your Firstfold code. It expires in 10 minutes. Do not share it.")).toBeNull();
  });

  it("reads a matching domain-bound code", () => {
    expect(otpCodeOf("004821 is your Firstfold code. It expires in 10 minutes. Do not share it.\n\n@app.firstfold.io #004821 Firstfold")).toBe("004821");
  });

  it.each([
    "\n\n@app.firstfold.io #123456 Firstfold",
    "\n\n@app.firstfold.io #004821 Firstfold\n",
    "\n\n@app.firstfold.io #004821 Firstfold\nExtra",
    "\n\n@app.firstfold.io #004821",
    "\n\n@app.firstfold.io/path #004821 Firstfold",
    "\n\n@127.0.0.1 #004821 Firstfold",
    "\n\n@app.firstfold.io #004821 Firstfold @evil.test",
  ])("refuses unregistered binding text %j", (suffix) => {
    expect(otpCodeOf(`004821 is your Firstfold code. It expires in 10 minutes. Do not share it.${suffix}`)).toBeNull();
  });

  it("refuses a trailing newline on legacy text", () => {
    expect(otpCodeOf(`${otpMessage("004821")}\n`)).toBeNull();
  });
});

describe("a text worded for another brand", () => {
  it("says that brand's name where the registered text says Firstfold", () => {
    expect(otpMessage("004821", undefined, "Fynix")).toBe("004821 is your Fynix code. It expires in 10 minutes. Do not share it.");
    expect(otpMessage("004821", "app.fynix.test", "Fynix")).toBe(
      "004821 is your Fynix code. It expires in 10 minutes. Do not share it.\n\n@app.fynix.test #004821 Fynix",
    );
  });

  it("leaves the registered Firstfold text exactly as it was", () => {
    expect(otpMessage("004821", undefined, "Firstfold")).toBe(otpMessage("004821"));
  });

  it("is not a registered shape, so it can never be read back for sending until its own template exists", () => {
    expect(otpCodeOf(otpMessage("004821", undefined, "Fynix"))).toBeNull();
  });
});
