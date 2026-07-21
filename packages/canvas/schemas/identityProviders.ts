import { z } from "zod";

export const identityProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  provider: z.string().optional(), // this acts as the providerType
  issuerUrl: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  discoveryUrl: z.string().optional(),
  jwksUrl: z.string().optional(),
  audiences: z.array(z.string()).optional(),
  scopes: z.array(z.string()).optional(),
  supportedAlgorithms: z.array(z.string()).optional(),
  customCapabilities: z.object({
    authentication: z.boolean().optional(),
    userManagement: z.boolean().optional(),
    identity: z.boolean().optional(),
    authorization: z.boolean().optional(),
  }).optional(),
  customOutputs: z.object({
    user: z.boolean().optional(),
    tokens: z.boolean().optional(),
    claims: z.boolean().optional(),
  }).optional(),
});
export type IdentityProvider = z.infer<typeof identityProviderSchema>;
