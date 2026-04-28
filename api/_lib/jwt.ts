import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET not set"); })()
);

export interface ChallengePayload {
  kind: "challenge";
  address: string;
  nonce: string;
}

export interface SessionPayload {
  kind: "session";
  address: string;
}

export async function signChallenge(address: string, nonce: string): Promise<string> {
  return new SignJWT({ kind: "challenge", address, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(SECRET);
}

export async function verifyChallenge(token: string): Promise<ChallengePayload> {
  const { payload } = await jwtVerify(token, SECRET);
  if (payload.kind !== "challenge" || typeof payload.address !== "string" || typeof payload.nonce !== "string") {
    throw new Error("invalid challenge token");
  }
  return { kind: "challenge", address: payload.address, nonce: payload.nonce };
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
