const UUID_PATTERN = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

export function extractSessionUuid(code: string): string | null {
  const trimmed = code.trim();
  const match = trimmed.match(UUID_PATTERN);
  const base = match ? match[1] : trimmed.replace(/^hm-/i, "");
  const value = base.trim();
  return value.length > 0 ? value : null;
}
