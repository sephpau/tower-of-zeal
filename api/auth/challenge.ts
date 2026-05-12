import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { getAddress } from "viem";
import { signChallenge } from "../_lib/jwt.js";
import { buildSignMessage, requestDomain } from "../_lib/signMessage.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const { address } = (req.body ?? {}) as { address?: string };
  if (typeof address !== "string") {
    res.status(400).json({ error: "address required" });
    return;
  }
  let normalized: string;
  try {
    normalized = getAddress(address);
  } catch {
    res.status(400).json({ error: "invalid address" });
    return;
  }
  const nonce = randomUUID();
  const ts = new Date().toISOString();
  const domain = requestDomain(req);
  const token = await signChallenge(normalized, nonce, ts, domain);
  const message = buildSignMessage({ address: normalized, nonce, ts, domain });
  res.status(200).json({ message, token });
}
