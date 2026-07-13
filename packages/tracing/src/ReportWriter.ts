import { writeFile } from "node:fs/promises";
import path from "node:path";
import { redact } from "./Redaction.js";
import { TracingError } from "./errors.js";
export class ReportWriter {
  constructor(readonly directory: string) {}
  async writeJson(name: string, value: unknown): Promise<string> {
    return this.write(name, `${JSON.stringify(redact(value), null, 2)}\n`);
  }
  async writeMarkdown(name: string, markdown: string): Promise<string> {
    return this.write(name, String(redact(markdown)));
  }
  async writeText(name: string, content: string): Promise<string> {
    return this.write(name, String(redact(content)));
  }
  private async write(name: string, content: string): Promise<string> {
    if (path.basename(name) !== name)
      throw new TracingError(
        "REPORT_WRITE",
        `Report name must not contain a path: ${name}`,
      );
    const target = path.join(this.directory, name);
    try {
      await writeFile(target, content, "utf8");
      return target;
    } catch (error) {
      throw new TracingError(
        "REPORT_WRITE",
        `Unable to write report: ${target}`,
        error,
      );
    }
  }
}
export async function writeReport(
  directory: string,
  name: string,
  value: unknown,
): Promise<void> {
  const writer = new ReportWriter(directory);
  if (name.endsWith(".md")) await writer.writeMarkdown(name, String(value));
  else if (typeof value === "string" && !name.endsWith(".json"))
    await writer.writeText(name, value);
  else await writer.writeJson(name, value);
}
