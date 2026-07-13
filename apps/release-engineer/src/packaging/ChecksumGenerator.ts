import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
export class ChecksumGenerator {
  async generate(
    archivePath: string,
  ): Promise<{ sha256: string; checksumPath: string }> {
    const sha256 = createHash("sha256")
      .update(await readFile(archivePath))
      .digest("hex");
    const checksumPath = `${archivePath}.sha256`;
    await writeFile(
      checksumPath,
      `${sha256}  ${path.basename(archivePath)}\n`,
      "utf8",
    );
    return { sha256, checksumPath };
  }
}
