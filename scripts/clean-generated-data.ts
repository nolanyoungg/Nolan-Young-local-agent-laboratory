import { readdir, rm } from "node:fs/promises";
import path from "node:path";

for (const root of ["reports/runs", "workspaces"]) {
  for (const entry of await readdir(root))
    if (entry !== ".gitkeep")
      await rm(path.join(root, entry), { recursive: true, force: true });
}
for (const category of ["apps", "packages"]) {
  for (const entry of await readdir(category, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const root = path.join(category, entry.name);
    await rm(path.join(root, "dist"), { recursive: true, force: true });
    await rm(path.join(root, "tsconfig.tsbuildinfo"), { force: true });
  }
}
for (const example of await readdir("examples", { withFileTypes: true }))
  if (example.isDirectory())
    await rm(path.join("examples", example.name, "dist"), {
      recursive: true,
      force: true,
    });
console.log(
  "Generated reports, temporary workspaces, build output, and incremental metadata removed.",
);
