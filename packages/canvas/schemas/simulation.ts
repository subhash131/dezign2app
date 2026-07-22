import { z } from "zod";

export const simulationTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  targetNodeId: z.string(),
  targetEventId: z.string().optional(),
  request: z.object({
    headers: z.record(z.string()).optional(),
    params: z.record(z.string()).optional(),
    body: z.unknown().optional(),
  }).optional(),
  expectedStatus: z.number().optional(),
  expectedBody: z.unknown().optional(),
  enabled: z.boolean().optional(),
  mocks: z.record(z.object({
    status: z.number().optional(),
    returnData: z.unknown().optional()
  })).optional(),
});
