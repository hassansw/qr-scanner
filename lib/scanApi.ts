import type { ScanApiResponse, VisitorFormData } from "@/lib/types";

export async function submitVisitor(payload: VisitorFormData): Promise<ScanApiResponse> {
  const response = await fetch("/api/visitors", {
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
      if (str) return str.length > 160 ? `${str.slice(0, 157)}...` : str;
    } catch {
      /* ignore */
    }
  }
  return ok ? "Visitor registered" : "Visitor registration failed";
}
