import { z } from "zod";

export const edgeDataSchema = z.object({
  label: z.string().optional(),
  sequenceOrder: z.number().optional(),
  sourceCardinality: z.enum(["1", "N"]).optional(),
  targetCardinality: z.enum(["1", "N"]).optional(),
  resourceKind: z.string().optional(),
  // --- Identity Connection Fields ---
  protocol: z.string().optional(),
  grantType: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUris: z.array(z.string()).optional(),
  pkce: z.boolean().optional(),
  scopes: z.array(z.string()).optional(),
  responseType: z.string().optional(),
  responseMode: z.string().optional(),
  notes: z.string().optional(),
});
