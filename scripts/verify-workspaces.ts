import { access, readdir } from "node:fs/promises";
import path from "node:path";

const expectedApplications = [
  "build-assistant",
  "code-editor",
  "release-engineer",
];
const expectedPackages = [
  "agent-runtime",
  "filesystem-tools",
  "local-model-client",
  "process-tools",
  "shared-types",
  "tracing",
  "workspace-security",
];

const applications = (await readdir("apps", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const packages = (await readdir("packages", { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(applications) !== JSON.stringify(expectedApplications))
  throw new Error(
    `Expected exactly ${expectedApplications.join(", ")}; found ${applications.join(", ")}`,
  );
if (JSON.stringify(packages) !== JSON.stringify(expectedPackages))
  throw new Error(
    `Workspace package set is incomplete: ${packages.join(", ")}`,
  );
await Promise.all(
  [
    ...applications.map((name) => path.join("apps", name)),
    ...packages.map((name) => path.join("packages", name)),
  ].flatMap((directory) => [
    access(path.join(directory, "package.json")),
    access(path.join(directory, "tsconfig.json")),
    access(path.join(directory, "src", "index.ts")),
  ]),
);
console.log(
  `Verified exactly ${applications.length} applications and ${packages.length} shared packages.`,
);
