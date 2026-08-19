import type { ScanApiResponse, VisitorFormData } from "@/lib/types";
import { DEFAULT_VISITOR_API_URL } from "../app/api/visitors/route";

type ProxyEnvelope = { ok: boolean; status: number; data: unknown };

function isProxyEnvelope(value: unknown): value is ProxyEnvelope {
  return (
    !!value &&
    typeof value === "object" &&
    "ok" in value &&
    "status" in value &&
    "data" in value
  );
}

export async function submitVisitor(payload: VisitorFormData): Promise<ScanApiResponse> {
  const response = await fetch(DEFAULT_VISITOR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = await response.text();
  }

  // /api/visitors wraps the upstream reply in { ok, status, data } — unwrap it
  // so message extraction sees the upstream body, not the envelope.
  if (isProxyEnvelope(body)) {
    return { ok: response.ok && body.ok, status: body.status, data: body.data };
  }

  return { ok: response.ok, status: response.status, data: body };
}

export function extractMessage(data: unknown, ok: boolean): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["message", "msg", "error", "detail"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    try {
      const str = JSON.stringify(data);
      if (str && str !== "{}") return str.length > 160 ? `${str.slice(0, 157)}...` : str;
    } catch {
      /* ignore */
    }
  }
  return ok ? "Visitor registered successfully" : "Visitor registration failed";
}
