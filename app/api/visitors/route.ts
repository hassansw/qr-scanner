export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DEFAULT_VISITOR_API_URL = "https://qasolutionadvisor-api.hashmove.com/visitors/general";
const API_KEY = process.env.API_KEY;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "A visitor object is required." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  if (typeof payload.session_uuid !== "string" || payload.session_uuid.length === 0) {
    return Response.json(
      { ok: false, error: "Field `session_uuid` is required." },
      { status: 400 }
    );
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const upstreamUrl = process.env.VISITOR_API_URL ?? DEFAULT_VISITOR_API_URL;

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { ok: false, error: "Could not reach the visitor registration API." },
      { status: 502 }
    );
  }

  let data: unknown = null;
  try {
    data = await upstream.json();
  } catch {
    data = await upstream.text();
  }

  return Response.json(
    { ok: upstream.ok, status: upstream.status, data },
    { status: upstream.status }
  );
}
