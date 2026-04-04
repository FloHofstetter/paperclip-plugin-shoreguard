import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a ShoreGuard webhook HMAC-SHA256 signature.
 *
 * ShoreGuard sends the header `X-Shoreguard-Signature: sha256={hex}`.
 * This function computes the expected HMAC and compares using timing-safe equality.
 */
export function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const receivedHex = signatureHeader.slice("sha256=".length);
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (receivedHex.length !== expectedHex.length) return false;
  return timingSafeEqual(Buffer.from(receivedHex, "hex"), Buffer.from(expectedHex, "hex"));
}