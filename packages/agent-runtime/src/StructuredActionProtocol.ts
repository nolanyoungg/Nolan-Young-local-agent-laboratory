import {
  toolActionJsonSchemas,
  zodToEmbeddedJsonSchema,
  type AgentDefinition,
  type JsonSchema,
  type ToolName,
} from "@laboratory/shared-types";

export interface StructuredActionProtocol {
  readonly instructions: string;
  readonly schema: JsonSchema;
  readonly actionTypes: readonly ToolName[];
}

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

export const buildStructuredActionProtocol = (
  agent: AgentDefinition,
): StructuredActionProtocol => {
  const toolTypes = unique(
    agent.permittedTools.filter(
      (name): name is Exclude<ToolName, "finish"> => name !== "finish",
    ),
  );
  const resultSchema = agent.outputSchema
    ? zodToEmbeddedJsonSchema(agent.outputSchema)
    : {};
  const finishSchema: JsonSchema = {
    type: "object",
    properties: {
      type: { type: "string", const: "finish" },
      result: resultSchema,
    },
    required: ["type", "result"],
    additionalProperties: false,
  };
  const schema: JsonSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    oneOf: [
      ...toolTypes.map((name) => toolActionJsonSchemas[name]),
      finishSchema,
    ],
  };
  const actionTypes: ToolName[] = [...toolTypes, "finish"];
  const instructions = [
    "STRUCTURED ACTION PROTOCOL (mandatory):",
    "- Respond with exactly one JSON object and no other text.",
    "- Do not use Markdown fences, XML/tool-call wrappers, commentary, or multiple objects.",
    "- Use only an action type listed in the schema below.",
    "- Property names are exact. Aliases such as file_path, filepath, command, and arguments are invalid unless explicitly present in the schema.",
    "- Request one evidence tool at a time. A tool result will be returned before your next action.",
    "- Never invent a tool result. Use finish only when the required result is supported by evidence.",
    "- Every finish.result must match its schema exactly.",
    ...(toolTypes.includes("apply_patch")
      ? [
          "- apply_patch is an exact replacement, not a unified diff: patch must be <old text>\\n---REPLACE-WITH---\\n<new text>. The old text must match exactly once.",
        ]
      : []),
    ...(toolTypes.includes("write_file")
      ? [
          "- write_file.content is the complete replacement file. Never omit unrelated content.",
        ]
      : []),
    ...(toolTypes.includes("create_file")
      ? ["- create_file fails when the path already exists."]
      : []),
    `Allowed action types: ${actionTypes.join(", ")}`,
    "Exact response JSON Schema:",
    JSON.stringify(schema),
  ].join("\n");
  return { instructions, schema, actionTypes };
};
