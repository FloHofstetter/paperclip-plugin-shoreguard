import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "../src/webhook-verify.js";

function sign(body: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifySignature", () => {
  const secret = "test-secret-key-1234567890abcdef";
  const body = '{"event_type":"sandbox.created","gateway":"dev"}';

  it("accepts a valid signature", () => {
    const sig = sign(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const sig = sign(body, "wrong-secret");
    expect(verifySignature(body, sig, secret)).toBe(false);
  });

  it("rejects a signature without sha256= prefix", () => {
    const hex = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body, hex, secret)).toBe(false);
  });

  it("rejects an empty signature", () => {
    expect(verifySignature(body, "", secret)).toBe(false);
  });

  it("rejects a signature with wrong length", () => {
    expect(verifySignature(body, "sha256=abcd", secret)).toBe(false);
  });

  it("works with different body content", () => {
    const otherBody = '{"event_type":"policy.updated"}';
    const sig = sign(otherBody, secret);
    expect(verifySignature(otherBody, sig, secret)).toBe(true);
    expect(verifySignature(body, sig, secret)).toBe(false);
  });
});