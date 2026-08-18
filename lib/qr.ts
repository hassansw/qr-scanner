const UUID_PATTERN = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i;

export function extractSessionUuid(code: string): string | null {
  const trimmed = code.trim();

  const match = trimmed.match(UUID_PATTERN);
  if (match) return match[1];

  // `hm-<id>` codes carry the session id directly.
  const prefixed = /^hm-(\S+)$/i.exec(trimmed);
  if (prefixed) return prefixed[1];

  return null;
}
