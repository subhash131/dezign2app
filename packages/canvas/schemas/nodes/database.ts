import { z } from "zod";
import { baseNodeDataSchema, envVarItemSchema } from "./base";

export const databaseConnectionStatusSchema = z.object({
  connected: z.boolean(),
  latencyMs: z.number().optional(),
  checkedAt: z.string().optional(),
  serverInfo: z.record(z.any()).optional(),
  error: z.string().optional(),
});

export const databaseTableColumnSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  isPrimaryKey: z.boolean().optional(),
  isPrimary: z.boolean().optional(),
  primaryKey: z.boolean().optional(),
  isNotNull: z.boolean().optional(),
  required: z.boolean().optional(),
});

export const databaseTableDefinitionSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  tableRef: z.string().optional(),
  columns: z.array(databaseTableColumnSchema).optional(),
  fields: z.array(databaseTableColumnSchema).optional(),
});

export const databaseDataSchema = baseNodeDataSchema.extend({
  description: z.string().optional(),
  dbEngine: z.string().optional(),
  dbType: z
    .enum(["relational", "document", "vector", "key-value", "redis", "nosql"])
    .optional(),
  dbCategory: z.enum(["sql", "nosql", "vector", "key-value"]).optional(),
  provider: z.string().optional(),
  dbConnectionType: z.enum(["env_var", "connection_string"]).optional(),
  connectionStringEnv: z.string().optional(),
  dbFilePath: z.string().optional(),
  dbFilePathEnv: z.string().optional(),
  hostEnv: z.string().optional(),
  portEnv: z.string().optional(),
  host: z.string().optional(),
  port: z.union([z.string(), z.number()]).optional(),
  databaseNameEnv: z.string().optional(),
  usernameEnv: z.string().optional(),
  passwordEnv: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  connectionString: z.string().optional(),
  database: z.string().optional(),
  user: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  isDefault: z.boolean().optional(),
  // Redis instance-wide server configurations
  maxmemoryPolicy: z
    .enum([
      "noeviction",
      "allkeys-lru",
      "volatile-lru",
      "allkeys-lfu",
      "volatile-lfu",
      "volatile-ttl",
      "allkeys-random",
      "volatile-random",
    ])
    .optional(),
  maxmemory: z.string().optional(),
  persistenceMode: z.enum(["RDB", "AOF", "RDB+AOF", "None"]).optional(),
  clustering: z.boolean().optional(),
  redisVersion: z.string().optional(),
  lastConnectionStatus: databaseConnectionStatusSchema.optional(),
  tables: z.array(databaseTableDefinitionSchema).optional(),
  envVars: z.array(envVarItemSchema).optional(),
});
