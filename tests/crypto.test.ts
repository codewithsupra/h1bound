import { describe, expect, it } from "vitest";
import { decrypt, decryptJson, encrypt, encryptJson } from "@/lib/crypto";

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("Priya, +1 555 0100");
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toBe(encrypt("Priya, +1 555 0100"));
    expect(decrypt(a)).toBe("Priya, +1 555 0100");
    expect(decryptJson(encryptJson({ visa: "F-1 OPT" }))).toEqual({ visa: "F-1 OPT" });
  });
  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, data] = encrypt("secret").split(":");
    const flipped = data.slice(0, -2) + (data.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt([v, iv, tag, flipped].join(":"))).toThrow();
  });
});
