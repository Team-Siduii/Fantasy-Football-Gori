import { describe, expect, it } from "vitest";
import { parseSessionEmail, serializeSession } from "../../src/lib/auth-session-codec";

describe("auth session cookie codec", () => {
  it("accepts only signed-in manager email session values", () => {
    expect(parseSessionEmail(serializeSession("Johan201@hotmail.com"))).toBe("johan201@hotmail.com");
    expect(parseSessionEmail(undefined)).toBeNull();
    expect(parseSessionEmail("")).toBeNull();
    expect(parseSessionEmail("legacy-session")).toBeNull();
    expect(parseSessionEmail("email:")).toBeNull();
    expect(parseSessionEmail("email:not-an-email")).toBeNull();
    expect(parseSessionEmail("email:%E0%A4%A")).toBeNull();
  });
});
