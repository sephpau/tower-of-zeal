// Server-side proxy to the MoTZ auth backend.
//
// For now we forward auth to the existing homeland.markofthezeal.com API
// routes (same MoTZ infrastructure, same Sky Mavis upstream). When the
// Terrariums endpoints are published we repoint UPSTREAM_BASE — no client
// changes needed.
//
// Override with TERRARIUM_UPSTREAM_BASE in .env.local.

export const UPSTREAM_BASE =
  process.env.TERRARIUM_UPSTREAM_BASE ?? "https://homeland.markofthezeal.com";

export async function proxyPost(path: string, req: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }

  try {
    const upstream = await fetch(`${UPSTREAM_BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return Response.json(
      { success: false, error: { error_message: `Upstream unreachable: ${String(err)}` } },
      { status: 502 }
    );
  }
}
