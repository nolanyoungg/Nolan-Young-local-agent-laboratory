import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AgentRunner, ToolRegistry } from "@laboratory/agent-runtime";
import { FilesystemToolFactory } from "@laboratory/filesystem-tools";
import type { LocalModelClient } from "@laboratory/local-model-client";
import {
  modelConfigSchema,
  type AgentDefinition,
  type ModelConfig,
} from "@laboratory/shared-types";
import { TraceRecorder } from "@laboratory/tracing";
import { WorkspaceGuard } from "@laboratory/workspace-security";

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const readToolSchema = z.enum([
  "list_files",
  "read_file",
  "read_file_metadata",
  "search_text",
]);

const agentMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  tools: z.array(readToolSchema).min(1),
  skills: z.array(slugSchema).min(1),
  maxSteps: z.coerce.number().int().min(1).max(500).default(80),
});

const skillMetadataSchema = z.object({
  name: slugSchema,
  description: z.string().min(1),
});

export const auditResultSchema = z.strictObject({
  summary: z.string().min(1),
  scopeReviewed: z.array(z.string()),
  findings: z.array(
    z.strictObject({
      severity: z.enum(["high", "medium", "low", "info"]),
      title: z.string().min(1),
      evidence: z.array(z.string().min(1)).min(1),
      impact: z.string().min(1),
      recommendation: z.string().min(1),
      path: z.string().min(1).optional(),
    }),
  ),
  limitations: z.array(z.string()),
  recommendedNextSteps: z.array(z.string()),
});
export type AuditResult = z.infer<typeof auditResultSchema>;

interface ParsedMarkdown {
  readonly metadata: Record<string, string | string[]>;
  readonly body: string;
}

export interface LoadedSkill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
}

export interface LoadedAgent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly tools: readonly z.infer<typeof readToolSchema>[];
  readonly skillIds: readonly string[];
  readonly maximumSteps: number;
  readonly instructions: string;
}

export interface RunLibraryAgentOptions {
  readonly repositoryRoot: string;
  readonly agentId: string;
  readonly workspace: string;
  readonly task: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly maximumSteps?: number;
  readonly reportDirectory?: string;
  readonly additionalSkills?: readonly string[];
}

export interface LibraryAgentRunResult {
  readonly agent: LoadedAgent;
  readonly skills: readonly LoadedSkill[];
  readonly model: string;
  readonly result: AuditResult;
  readonly reportDirectory: string;
}

const parseMarkdown = (contents: string, source: string): ParsedMarkdown => {
  const normalized = contents.replaceAll("\r\n", "\n");
  if (!normalized.startsWith("---\n"))
    throw new Error(`${source} must start with YAML frontmatter`);
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) throw new Error(`${source} has unclosed YAML frontmatter`);
  const lines = normalized.slice(4, closing).split("\n");
  const metadata: Record<string, string | string[]> = {};
  let activeList: string | undefined;
  for (const line of lines) {
    const item = /^\s+-\s+(.+)$/u.exec(line);
    if (item && activeList) {
      const values = metadata[activeList];
      if (Array.isArray(values)) values.push(item[1]!.trim());
      continue;
    }
    const property = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/u.exec(line);
    if (!property)
      throw new Error(`${source} contains unsupported frontmatter: ${line}`);
    const [, key, rawValue] = property;
    if (!key) continue;
    if (rawValue) {
      metadata[key] = rawValue.trim().replace(/^['"]|['"]$/gu, "");
      activeList = undefined;
    } else {
      metadata[key] = [];
      activeList = key;
    }
  }
  return { metadata, body: normalized.slice(closing + 5).trim() };
};

export const loadSkill = async (
  repositoryRoot: string,
  id: string,
): Promise<LoadedSkill> => {
  slugSchema.parse(id);
  const directory = path.join(repositoryRoot, "skills", id);
  const source = path.join(directory, "SKILL.md");
  const parsed = parseMarkdown(await readFile(source, "utf8"), source);
  const metadata = skillMetadataSchema.parse(parsed.metadata);
  if (metadata.name !== id)
    throw new Error(`Skill folder ${id} does not match name ${metadata.name}`);
  const referenceDirectory = path.join(directory, "references");
  let referenceNames: string[] = [];
  try {
    referenceNames = (await readdir(referenceDirectory))
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const references = await Promise.all(
    referenceNames.map(async (name) => ({
      name,
      contents: await readFile(path.join(referenceDirectory, name), "utf8"),
    })),
  );
  return {
    id,
    name: metadata.name,
    description: metadata.description,
    instructions: [
      parsed.body,
      ...references.map(
        ({ name, contents }) =>
          `## Bundled reference: ${name}\n\n${contents.trim()}`,
      ),
    ].join("\n\n"),
  };
};

export const loadAgent = async (
  repositoryRoot: string,
  id: string,
): Promise<LoadedAgent> => {
  slugSchema.parse(id);
  const source = path.join(repositoryRoot, "agents", id, "AGENT.md");
  const parsed = parseMarkdown(await readFile(source, "utf8"), source);
  const metadata = agentMetadataSchema.parse(parsed.metadata);
  return {
    id,
    name: metadata.name,
    description: metadata.description,
    tools: metadata.tools,
    skillIds: metadata.skills,
    maximumSteps: metadata.maxSteps,
    instructions: parsed.body,
  };
};

export const listLibraryEntries = async (
  repositoryRoot: string,
): Promise<{ agents: string[]; skills: string[] }> => {
  const directories = async (name: string): Promise<string[]> =>
    (await readdir(path.join(repositoryRoot, name), { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() && slugSchema.safeParse(entry.name).success,
      )
      .map((entry) => entry.name)
      .sort();
  return {
    agents: await directories("agents"),
    skills: await directories("skills"),
  };
};

interface OllamaModelEntry {
  readonly name: string;
  readonly size: number;
}

export const discoverOllamaModels = async (
  baseUrl: string,
): Promise<readonly OllamaModelEntry[]> => {
  const validated = modelConfigSchema.parse({ baseUrl });
  const response = await fetch(new URL("/api/tags", validated.baseUrl), {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok)
    throw new Error(`Ollama returned HTTP ${response.status} from /api/tags`);
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("models" in body) ||
    !Array.isArray(body.models)
  )
    throw new Error("Ollama returned an invalid model list");
  return body.models
    .flatMap((entry): OllamaModelEntry[] => {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("name" in entry) ||
        typeof entry.name !== "string"
      )
        return [];
      return [
        {
          name: entry.name,
          size:
            "size" in entry && typeof entry.size === "number" ? entry.size : 0,
        },
      ];
    })
    .sort(
      (left, right) =>
        right.size - left.size || left.name.localeCompare(right.name),
    );
};

const selectModel = async (
  baseUrl: string,
  requested?: string,
): Promise<string> => {
  const installed = await discoverOllamaModels(baseUrl);
  if (installed.length === 0)
    throw new Error("Ollama is running but has no installed models");
  if (!requested) return installed[0]!.name;
  if (!installed.some(({ name }) => name === requested))
    throw new Error(`Ollama model ${requested} is not installed`);
  return requested;
};

const markdownReport = (
  agent: LoadedAgent,
  model: string,
  result: AuditResult,
): string => {
  const findings = result.findings.length
    ? result.findings
        .map(
          (finding, index) =>
            `## ${index + 1}. [${finding.severity.toUpperCase()}] ${finding.title}\n\n${finding.path ? `Path: \`${finding.path}\`\n\n` : ""}Impact: ${finding.impact}\n\nEvidence:\n${finding.evidence.map((item) => `- ${item}`).join("\n")}\n\nRecommendation: ${finding.recommendation}`,
        )
        .join("\n\n")
    : "No findings were reported.";
  return `# ${agent.name} report\n\nModel: \`${model}\`\n\n${result.summary}\n\n${findings}\n\n## Scope reviewed\n\n${result.scopeReviewed.map((item) => `- ${item}`).join("\n") || "- Not reported"}\n\n## Limitations\n\n${result.limitations.map((item) => `- ${item}`).join("\n") || "- None reported"}\n\n## Recommended next steps\n\n${result.recommendedNextSteps.map((item) => `- ${item}`).join("\n") || "- None reported"}\n`;
};

export const runLibraryAgent = async (
  options: RunLibraryAgentOptions,
  modelClient: LocalModelClient,
): Promise<LibraryAgentRunResult> => {
  const agent = await loadAgent(options.repositoryRoot, options.agentId);
  const skillIds = [
    ...new Set([
      ...(agent.skillIds ?? []),
      ...(options.additionalSkills ?? []),
    ]),
  ];
  const skills = await Promise.all(
    skillIds.map((id) => loadSkill(options.repositoryRoot, id)),
  );
  const baseUrl = options.baseUrl ?? "http://127.0.0.1:11434";
  const model = await selectModel(baseUrl, options.model);
  const modelConfig: ModelConfig = modelConfigSchema.parse({ baseUrl, model });
  const guard = await WorkspaceGuard.create(options.workspace, {
    read: ["**"],
    write: [],
  });
  const registry = new ToolRegistry();
  const factory = new FilesystemToolFactory(guard);
  for (const name of agent.tools)
    registry.register(name, {
      execute: async (action) => factory.create(name).execute(action),
    });
  const runId = randomUUID();
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replaceAll(".", "-");
  const reportDirectory = path.resolve(
    options.reportDirectory ??
      path.join(options.repositoryRoot, "reports", "agent-runs"),
    `${timestamp}-${agent.id}-${runId}`,
  );
  await mkdir(reportDirectory, { recursive: true });
  const trace = new TraceRecorder(
    runId,
    path.join(reportDirectory, "trace.jsonl"),
  );
  await trace.initialize();
  const systemInstructions = [
    agent.instructions,
    "Use the available repository tools methodically. Ground every finding in observed evidence. Do not claim to have executed software, measured runtime performance, or inspected files you did not actually inspect.",
    ...skills.map(
      (skill) => `# Loaded skill: ${skill.name}\n\n${skill.instructions}`,
    ),
  ].join("\n\n");
  const definition: AgentDefinition = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    systemInstructions,
    permittedTools: agent.tools,
    maximumSteps: options.maximumSteps ?? agent.maximumSteps,
    outputSchema: auditResultSchema,
  };
  const result = auditResultSchema.parse(
    await new AgentRunner(modelClient, registry, trace).run(
      definition,
      options.task,
      modelConfig,
    ),
  );
  await writeFile(
    path.join(reportDirectory, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(reportDirectory, "report.md"),
    markdownReport(agent, model, result),
    "utf8",
  );
  await writeFile(
    path.join(reportDirectory, "run-metadata.json"),
    `${JSON.stringify({ runId, agent: agent.id, skills: skillIds, workspace: guard.root, model, baseUrl }, null, 2)}\n`,
    "utf8",
  );
  return { agent, skills, model, result, reportDirectory };
};
