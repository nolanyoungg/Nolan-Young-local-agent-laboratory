#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listLibraryEntries, loadAgent, loadSkill } from "./agent-library.js";

export const validateAgentLibrary = async (
  repositoryRoot: string,
): Promise<void> => {
  const entries = await listLibraryEntries(repositoryRoot);
  if (entries.agents.length === 0) throw new Error("No agents found");
  if (entries.skills.length === 0) throw new Error("No skills found");
  const availableSkills = new Set(entries.skills);
  for (const skillId of entries.skills) {
    const skill = await loadSkill(repositoryRoot, skillId);
    if (/\bTODO\b/u.test(skill.instructions))
      throw new Error(`Skill ${skillId} still contains TODO text`);
  }
  for (const agentId of entries.agents) {
    const agent = await loadAgent(repositoryRoot, agentId);
    for (const skillId of agent.skillIds)
      if (!availableSkills.has(skillId))
        throw new Error(`Agent ${agentId} references missing skill ${skillId}`);
    if (/\bTODO\b/u.test(agent.instructions))
      throw new Error(`Agent ${agentId} still contains TODO text`);
  }
  console.log(
    `Validated ${entries.agents.length} agents and ${entries.skills.length} skills.`,
  );
};

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await validateAgentLibrary(repositoryRoot);
