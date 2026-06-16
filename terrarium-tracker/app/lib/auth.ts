// Client-side auth helpers.
// Mirrors the homeland.markofthezeal.com login flow so the same Sky Mavis
// tokens are produced and stored under the same localStorage key — meaning
// accounts are interchangeable between the two tools.

export const ACCOUNTS_KEY = "ACCOUNTS_DATA";

export type Account = {
  accessToken: string;
  accessTokenExpiresAt?: string;
  accessTokenExpiresIn?: number;
  refreshToken: string;
  userID: string;
  gameToken?: string;
  enabled_mfa?: boolean;
  name?: string;
  email?: string;
  // Local-only flags (homeland uses these too)
  tokenExpired?: boolean;
};

type ApiResult<T> = { success: boolean; data?: T; error?: unknown };

/** SHA-256 hex of the plaintext password — exactly what homeland sends. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function readAccounts(): Account[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeAccounts(list: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

/** Merge a freshly-authenticated account into the list, de-duped by userID. */
export function mergeAccount(list: Account[], incoming: Account): Account[] {
  const next = list.filter((a) => a.userID !== incoming.userID);
  next.push({ ...incoming, tokenExpired: false });
  return next;
}

export function removeAccount(list: Account[], userID: string): Account[] {
  return list.filter((a) => a.userID !== userID);
}

async function postJson<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---- Auth calls (proxied through our /api routes to Sky Mavis) ----

export type LoginResponse = {
  success: boolean;
  data?: Account;
  // When MFA is required the server returns the challenge token here.
  error?: { error_message?: string; error_details?: { mfaToken?: string } };
};

export function login(email: string, hashedPassword: string, captcha: string) {
  return postJson<Account>("/api/login", {
    email,
    password: hashedPassword,
    captcha,
  }) as Promise<LoginResponse>;
}

export function submitMfa(token: string, passcode: string) {
  return postJson<Account>("/api/mfa", { token, passcode, challenge: "" });
}

export function refresh(refreshToken: string) {
  return postJson<Account>("/api/refresh", { refreshToken });
}
