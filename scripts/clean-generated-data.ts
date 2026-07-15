import { readdir, rm } from "node:fs/promises";
import path from "node:path";

for (const root of ["reports/agent-runs"]) {
  for (const entry of await readdir(root))
    if (entry !== ".gitkeep")
      await rm(path.join(root, entry), { recursive: true, force: true });
}
for (const entry of await readdir("packages", { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const root = path.join("packages", entry.name);
  await rm(path.join(root, "dist"), { recursive: true, force: true });
  await rm(path.join(root, "tsconfig.tsbuildinfo"), { force: true });
}
console.log(
  "Generated agent reports, build output, and incremental metadata removed.",
);
