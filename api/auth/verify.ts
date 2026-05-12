import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAddress, verifyMessage } from "viem";
import { verifyChallenge, signSession } from "../_lib/jwt.js";
import { holdsAnyGatedNft } from "../_lib/ronin.js";
import { buildSignMessage } from "../_lib/signMessage.js";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  const { address, signature, token } = (req.body ?? {}) as {
    address?: string; signature?: string; token?: string;
  };
  if (typeof address !== "string" || typeof signature !== "string" || typeof token !== "string") {
    res.status(400).json({ error: "address, signature, token required" });
    return;
  }

  let normalized: ReturnType<typeof getAddress>;
  try { normalized = getAddress(address); }
  catch { res.status(400).json({ error: "invalid address" }); return; }

  let challenge;
  try { challenge = await verifyChallenge(token); }
  catch { res.status(400).json({ error: "invalid or expired challenge" }); return; }

  if (challenge.address !== normalized) {
    res.status(400).json({ error: "address mismatch" });
    return;
  }

  const message = buildSignMessage({
    address: normalized,
    nonce: challenge.nonce,
    ts: challenge.ts,
    domain: challenge.domain,
  });

  const ok = await verifyMessage({ address: normalized, message, signature: signature as `0x${string}` });
  if (!ok) {
    res.status(401).json({ error: "bad signature" });
    return;
  }

  const holds = await holdsAnyGatedNft(normalized);
  if (!holds) {
    res.status(403).json({ error: "wallet does not hold required NFT" });
    return;
  }

  const session = await signSession(normalized);
  res.status(200).json({ session, address: normalized });
}
