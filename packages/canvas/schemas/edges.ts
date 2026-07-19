import { z } from "zod";

export const edgeDataSchema = z.object({
  label: z.string().optional(),
  sequenceOrder: z.number().optional(),
  sourceCardinality: z.enum(["1", "N"]).optional(),
  targetCardinality: z.enum(["1", "N"]).optional(),
  resourceKind: z.string().optional(),
});
