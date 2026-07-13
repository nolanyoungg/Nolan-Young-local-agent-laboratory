import { z } from "zod";

export const traceEventTypeSchema = z.enum([
  "workflow_started",
  "workflow_completed",
  "workflow_failed",
  "agent_started",
  "agent_completed",
  "model_request_started",
  "model_response_received",
  "tool_requested",
  "tool_rejected",
  "tool_started",
  "tool_completed",
  "tool_failed",
  "process_started",
  "process_completed",
  "validation_started",
  "validation_completed",
  "repair_pass_started",
  "repair_pass_completed",
]);
export const traceTypes = traceEventTypeSchema.options;
export const traceEventSchema = z.object({
  timestamp: z.iso.datetime(),
  type: traceEventTypeSchema,
  runId: z.string().min(1),
  sequence: z.number().int().positive(),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type TraceEvent = z.infer<typeof traceEventSchema>;
