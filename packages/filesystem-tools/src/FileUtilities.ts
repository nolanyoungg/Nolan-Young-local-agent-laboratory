import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
export const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");
export const isBinary = (buffer: Buffer): boolean =>
  buffer.subarray(0, Math.min(buffer.length, 8_000)).includes(0);
export const truncateUtf8 = (
  value: string,
  maximumBytes: number,
): {
  value: string;
  truncated: boolean;
  originalBytes: number;
  returnedBytes: number;
} => {
  const originalBytes = Buffer.byteLength(value);
  if (originalBytes <= maximumBytes)
    return {
      value,
      truncated: false,
      originalBytes,
      returnedBytes: originalBytes,
    };
  let end = Math.min(value.length, maximumBytes);
  while (Buffer.byteLength(value.slice(0, end)) > maximumBytes) end -= 1;
  const output = value.slice(0, end);
  return {
    value: output,
    truncated: true,
    originalBytes,
    returnedBytes: Buffer.byteLength(output),
  };
};
export const readUtf8 = async (
  target: string,
): Promise<{ content: string; buffer: Buffer; lineEnding: "\r\n" | "\n" }> => {
  const buffer = await readFile(target);
  if (isBinary(buffer)) throw new Error("BINARY_FILE");
  const content = buffer.toString("utf8");
  return {
    content,
    buffer,
    lineEnding: content.includes("\r\n") ? "\r\n" : "\n",
  };
};
export const atomicWriteUtf8 = async (
  target: string,
  content: string,
): Promise<void> => {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.agent-${process.pid}-${Date.now()}.tmp`,
  );
  try {
    await writeFile(temporary, content, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
};
