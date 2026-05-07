import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { getAddress } from "viem";
import { signChallenge } from "../_lib/jwt.js";

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
  const token = await signChallenge(normalized, nonce);
  const message = buildMessage(normalized, nonce);
  res.status(200).json({ message, token });
}

function buildMessage(address: string, nonce: string): string {
  return `The Gauntlet Tower — sign in\n\nAddress: ${address}\nNonce: ${nonce}\n\nThis signature does not authorize any transaction.`;
}
