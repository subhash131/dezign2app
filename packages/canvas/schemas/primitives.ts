import { z } from "zod";

export const retryPolicyEnum = z.enum(["NONE", "IMMEDIATE", "EXPONENTIAL"]);
export const deliveryGuaranteeEnum = z.enum(["EXACTLY_ONCE", "AT_LEAST_ONCE", "AT_MOST_ONCE", "FIRE_AND_FORGET"]);
export const eventOrderingEnum = z.enum(["NONE", "GLOBAL", "PER_ENTITY", "PER_AGGREGATE"]);
export const eventCategoryEnum = z.enum(["DOMAIN", "INTEGRATION", "INTERNAL", "NOTIFICATION"]);
export const schemaVersionEnum = z.enum(["v1", "v2", "v3"]);

export const processingOperationEnum = z.enum([
  "passthrough", "validate", "pick", "omit", "rename", "set", "filter", "map",
  "db_get", "db_get_many", "db_insert", "db_update", "db_delete", "return",
]);
