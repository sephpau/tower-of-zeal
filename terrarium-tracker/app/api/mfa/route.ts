import { proxyPost } from "@/app/lib/proxy";

export async function POST(req: Request) {
  return proxyPost("/api/mfa", req);
}
