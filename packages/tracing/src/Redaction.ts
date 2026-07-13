const secretKey =
  /(authorization|cookie|password|passwd|token|secret|private.?key|api.?key|client.?secret)/i;
const sensitiveValuePatterns = [
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /((?:api[_-]?key|token|password|secret)\s*[=:]\s*)[^\s,;]+/gi,
  /-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g,
];
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? "[REDACTED]" : redact(item, seen),
      ]),
    );
  }
  if (typeof value === "string")
    return sensitiveValuePatterns.reduce(
      (current, pattern) =>
        current.replace(
          pattern,
          (match, prefix: string | undefined) => `${prefix ?? ""}[REDACTED]`,
        ),
      value,
    );
  return value;
}
