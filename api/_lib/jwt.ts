import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET not set"); })()
);

export interface ChallengePayload {
  kind: "challenge";
  address: string;
  nonce: string;
  /** ISO timestamp the message was issued at; baked into the signed message
   *  so the wallet sees a time and verify can reconstruct the exact string. */
  ts: string;
  /** Domain (Host header) the challenge was issued from; shown in the sign
   *  prompt so phishing on a different domain is visible to the user. */
  domain: string;
}

export interface SessionPayload {
  kind: "session";
  address: string;
}

export async function signChallenge(address: string, nonce: string, ts: string, domain: string): Promise<string> {
  return new SignJWT({ kind: "challenge", address, nonce, ts, domain })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(SECRET);
}

export async function verifyChallenge(token: string): Promise<ChallengePayload> {
  const { payload } = await jwtVerify(token, SECRET);
  if (
    payload.kind !== "challenge"
    || typeof payload.address !== "string"
    || typeof payload.nonce !== "string"
    || typeof payload.ts !== "string"
    || typeof payload.domain !== "string"
  ) {
    throw new Error("invalid challenge token");
  }
  return {
    kind: "challenge",
    address: payload.address,
    nonce: payload.nonce,
    ts: payload.ts,
    domain: payload.domain,
  };
}

export async function signSession(address: string): Promise<string> {
  return new SignJWT({ kind: "session", address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  if (payload.kind !== "session" || typeof payload.address !== "string") {
    throw new Error("invalid session token");
  }
  return { kind: "session", address: payload.address };
}

export interface RunPayload {
  kind: "run";
  runId: string;
  address: string;
}

export async function signRun(runId: string, address: string): Promise<string> {
  return new SignJWT({ kind: "run", runId, address })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(SECRET);
}

export async function verifyRun(token: string): Promise<RunPayload> {
  const { payload } = await jwtVerify(token, SECRET);
  if (payload.kind !== "run" || typeof payload.runId !== "string" || typeof payload.address !== "string") {
    throw new Error("invalid run token");
  }
  return { kind: "run", runId: payload.runId, address: payload.address };
}
