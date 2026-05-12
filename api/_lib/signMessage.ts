// Shared sign-in message builder. The CHALLENGE endpoint generates the string
// and the VERIFY endpoint reconstructs it byte-for-byte from the JWT payload,
// so any tweak here must apply to both call sites at once.

export interface SignMessageInputs {
  address: string;
  nonce: string;
  ts: string;
  domain: string;
}

export function buildSignMessage(i: SignMessageInputs): string {
  return [
    "Welcome to Gauntlet Tower!",
    "",
    "Sign to verify wallet ownership.",
    "This is not a transaction and will not cost gas.",
    "",
    `Wallet: ${i.address}`,
    `Timestamp: ${i.ts}`,
    `Nonce: ${i.nonce}`,
    `Domain: ${i.domain}`,
  ].join("\n");
}

/** Extract the host (no protocol, no port) the request was made against.
 *  Falls back to "gauntlet-tower" for local / unknown environments. */
export function requestDomain(req: { headers: Record<string, string | string[] | undefined> }): string {
  const raw = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
  const host = Array.isArray(raw) ? raw[0] : raw;
  if (!host) return "gauntlet-tower";
  // Strip any :port suffix.
  return host.split(":")[0].toLowerCase();
}
