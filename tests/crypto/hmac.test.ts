import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hmacEqual, hmacSha256Hex } from "@/lib/crypto/hmac";

describe("hmac", () => {
  it("matches the Node reference", () => {
    expect(hmacSha256Hex("secret", "message")).toBe(createHmac("sha256", "secret").update("message").digest("hex"));
  });

  it("depends on both the key and the message", () => {
    const base = hmacSha256Hex("secret", "message");
    expect(hmacSha256Hex("secret2", "message")).not.toBe(base);
    expect(hmacSha256Hex("secret", "message2")).not.toBe(base);
  });

  it("compares equal, different and different-length values", () => {
    const mac = hmacSha256Hex("secret", "message");
    expect(hmacEqual(mac, mac)).toBe(true);
    expect(hmacEqual(mac, hmacSha256Hex("secret", "other"))).toBe(false);
    expect(hmacEqual(mac, mac.slice(0, 10))).toBe(false);
  });
});
