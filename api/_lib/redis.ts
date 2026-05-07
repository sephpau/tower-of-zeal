// Thin Upstash Redis REST client. Uses fetch — no SDK dep.
// Env vars (set in Vercel project settings):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const URL = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function ensureConfigured(): void {
  if (!URL || !TOKEN) throw new Error("Upstash Redis not configured (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
}

async function call(args: (string | number)[]): Promise<unknown> {
  ensureConfigured();
  const r = await fetch(URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}: ${await r.text()}`);
  const data = await r.json() as { result?: unknown; error?: string };
  if (data.error) throw new Error(`upstash: ${data.error}`);
  return data.result;
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await call(["SET", key, JSON.stringify(value), "EX", ttlSeconds]);
}

export async function getJson<T>(key: string): Promise<T | null> {
  const r = await call(["GET", key]);
  if (typeof r !== "string") return null;
  try { return JSON.parse(r) as T; } catch { return null; }
}

export async function del(key: string): Promise<void> {
  await call(["DEL", key]);
}

export async function zaddGt(key: string, score: number, member: string): Promise<void> {
  // GT: only update if new score is greater than existing.
  await call(["ZADD", key, "GT", "CH", score, member]);
}

export async function zaddLt(key: string, score: number, member: string): Promise<number> {
  // LT: only update if new score is less than existing (used for "fastest" boards).
  // CH returns the count of changed elements: 1 if the score got better, 0 otherwise.
  const r = await call(["ZADD", key, "LT", "CH", score, member]);
  return typeof r === "number" ? r : 0;
}

export async function zrangeWithScores(key: string, start: number, stop: number): Promise<ZEntry[]> {
  const r = await call(["ZRANGE", key, start, stop, "WITHSCORES"]);
  if (!Array.isArray(r)) return [];
  const out: ZEntry[] = [];
  for (let i = 0; i < r.length; i += 2) {
    out.push({ member: String(r[i]), score: Number(r[i + 1]) });
  }
  return out;
}

export interface ZEntry { member: string; score: number; }

export async function zrevrangeWithScores(key: string, start: number, stop: number): Promise<ZEntry[]> {
  const r = await call(["ZREVRANGE", key, start, stop, "WITHSCORES"]);
  if (!Array.isArray(r)) return [];
  const out: ZEntry[] = [];
  for (let i = 0; i < r.length; i += 2) {
    out.push({ member: String(r[i]), score: Number(r[i + 1]) });
  }
  return out;
}

export async function incrWithExpire(key: string, ttlSeconds: number): Promise<number> {
  const n = await call(["INCR", key]) as number;
  if (n === 1) await call(["EXPIRE", key, ttlSeconds]);
  return n;
}

export async function incrBy(key: string, amount: number): Promise<number> {
  return await call(["INCRBY", key, Math.floor(amount)]) as number;
}

export async function getNumber(key: string): Promise<number> {
  const r = await call(["GET", key]);
  if (typeof r !== "string") return 0;
  const n = Number(r);
  return Number.isFinite(n) ? n : 0;
}

/** Sets the key only if it does not exist. Returns true if the lock was acquired. */
export async function setNxWithExpire(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  // Upstash REST translates SET key value NX EX seconds — returns "OK" on success, null otherwise.
  const r = await call(["SET", key, value, "NX", "EX", ttlSeconds]);
  return r === "OK";
}

export async function hset(key: string, field: string, value: string): Promise<void> {
  await call(["HSET", key, field, value]);
}

export async function hmget(key: string, fields: string[]): Promise<(string | null)[]> {
  if (fields.length === 0) return [];
  const r = await call(["HMGET", key, ...fields]);
  if (!Array.isArray(r)) return fields.map(() => null);
  return r.map(v => (typeof v === "string" ? v : null));
}
