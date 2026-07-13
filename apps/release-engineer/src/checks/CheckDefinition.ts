import { z } from "zod";
export const checkResultSchema = z.object({
  id: z.string(),
  type: z.enum([
    "command",
    "required-file",
    "forbidden-file",
    "package-inspection",
  ]),
  mandatory: z.boolean(),
  success: z.boolean(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type CheckResult = z.infer<typeof checkResultSchema>;
export interface CheckDefinition {
  readonly id: string;
  readonly mandatory: boolean;
  run(): Promise<CheckResult>;
}
