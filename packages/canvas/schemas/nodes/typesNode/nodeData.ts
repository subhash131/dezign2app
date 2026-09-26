import { z } from "zod";
import { baseNodeDataSchema } from "../base";
import { customTypeItemSchema } from "./item";

export const entitySyncWarningSchema = z.object({
  entityId: z.string(),
  entityName: z.string(),
  updatedAt: z.number(),
  affectedNodes: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      type: z.string().optional(),
    }),
  ),
  dismissed: z.boolean().optional(),
});

export type EntitySyncWarning = z.infer<typeof entitySyncWarningSchema>;

/**
 * Full data schema for a Types canvas node.
 *
 * A Types node can be one of three variants:
 *  - Custom types node  – user-defined interfaces / type aliases / enums (scope: global | local)
 *  - Package types node – types extracted from an npm package in node_modules
 *  - Extended types node – a custom node that extends one or more package types
 */
export const typesNodeDataSchema = baseNodeDataSchema
  .extend({
    description: z.string().optional(),

    // Scoping: does this node export types globally or only to a specific service?
    scope: z.enum(["global", "local"]).optional().default("global"),
    targetServiceId: z.string().optional(),
    targetWebAppId: z.string().optional(),

    // Definition mode: visual field editor vs. raw TypeScript text editor
    definitionMode: z.enum(["visual", "raw"]).optional().default("visual"),
    rawTypeScript: z.string().optional(),

    // The actual type definitions
    types: z.array(customTypeItemSchema).optional(),

    // Package node metadata
    packageSources: z.array(z.string()).optional(),
    isPackageNode: z.boolean().optional(),
    packageName: z.string().optional(),
    packageVersion: z.string().optional(),
    isInstalled: z.boolean().optional(),
    installError: z.string().optional(),

    // Extension / inheritance flags
    isExtended: z.boolean().optional(),
    extendedFromNodeId: z.string().optional(),

    // Node-level read-only lock (e.g. pure package nodes)
    isReadOnly: z.boolean().optional(),

    // Entity-derived type synchronization tracking
    sourceEntityId: z.string().optional(),
    sourceEntityName: z.string().optional(),
    entityUpdatedAt: z.number().optional(),
    entitySyncWarning: entitySyncWarningSchema.optional(),
  })
  .passthrough();

export type TypesNodeData = z.infer<typeof typesNodeDataSchema>;
