import type { ModelRequest, ModelResponse } from "@laboratory/shared-types";
import type { LocalModelClient, ModelHealth } from "./LocalModelClient.js";
import { ModelClientError } from "./errors.js";
export type MockResponse =
  | string
  | Error
  | ((request: ModelRequest, call: number) => string | Promise<string>);
export class MockModelClient implements LocalModelClient {
  private callIndex = 0;
  private readonly responses: readonly MockResponse[];
  constructor(responses?: readonly MockResponse[]) {
    this.responses = responses ?? [defaultMockResponse];
  }
  get calls(): number {
    return this.callIndex;
  }
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const call = this.callIndex++;
    const selected = this.responses[call] ?? this.responses.at(-1);
    if (selected === undefined)
      throw new ModelClientError(
        "EMPTY_RESPONSE",
        "Mock model has no configured response.",
      );
    if (selected instanceof Error) throw selected;
    const content =
      typeof selected === "function" ? await selected(request, call) : selected;
    if (!content.trim())
      throw new ModelClientError(
        "EMPTY_RESPONSE",
        "Mock model returned an empty response.",
      );
    return { content, model: request.config.model, done: true };
  }
  async healthCheck(): Promise<ModelHealth> {
    return {
      healthy: true,
      providerReachable: true,
      modelInstalled: true,
      message: "Mock model is ready.",
    };
  }
}

const defaultMockResponse = (request: ModelRequest): string => {
  const system =
    request.messages
      .find((message) => message.role === "system")
      ?.content.toLocaleLowerCase() ?? "";
  let result: unknown = { summary: "Mock agent completed." };
  if (system.includes("planner"))
    result = {
      summary: "Mock plan completed.",
      affectedFiles: [],
      risks: [],
      steps: ["Inspect the requested scope."],
      validation: [],
    };
  else if (system.includes("build diagnosis"))
    result = {
      summary: "Mock diagnosis found no safe automatic repair.",
      rootCauses: ["The deterministic command failed."],
      affectedFiles: [],
      repairSteps: [],
      repairable: false,
    };
  else if (system.includes("build repair"))
    result = {
      summary: "Mock repair made no changes.",
      changedFiles: [],
      safeToRetry: false,
      remainingRisks: [],
    };
  else if (system.includes("build reviewer"))
    result = {
      approved: true,
      summary: "Mock build review completed.",
      findings: [],
      unrelatedChanges: [],
    };
  else if (system.includes("release reviewer"))
    result = {
      summary: "Mock release review found no safe repair.",
      repairable: false,
      risks: [],
      repairStrategy: [],
    };
  else if (system.includes("release repair"))
    result = {
      summary: "Mock release repair made no changes.",
      changedFiles: [],
      safeToRevalidate: false,
      remainingRisks: [],
    };
  else if (system.includes("reviewer"))
    result = {
      approved: true,
      summary: "Mock code review completed.",
      findings: [],
      omissions: [],
      unrelatedChanges: [],
    };
  else if (system.includes("editor"))
    result = {
      summary: "Mock editor made no changes.",
      changedFiles: [],
      validationNotes: [],
      remainingRisks: [],
    };
  return JSON.stringify({ type: "finish", result });
};
