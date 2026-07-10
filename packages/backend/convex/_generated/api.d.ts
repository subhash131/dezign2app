/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ai_conversations from "../ai/conversations.js";
import type * as ai_messages from "../ai/messages.js";
import type * as api_keys from "../api_keys.js";
import type * as billing from "../billing.js";
import type * as canvas from "../canvas.js";
import type * as http from "../http.js";
import type * as kanban from "../kanban.js";
import type * as projects from "../projects.js";
import type * as schema_auth from "../schema/auth.js";
import type * as schema_features from "../schema/features.js";
import type * as schema_workflows from "../schema/workflows.js";
import type * as users from "../users.js";
import type * as workflows__utils from "../workflows/_utils.js";
import type * as workflows_cron from "../workflows/cron.js";
import type * as workflows_crud from "../workflows/crud.js";
import type * as workflows_runs from "../workflows/runs.js";
import type * as workflows_secrets from "../workflows/secrets.js";
import type * as workflows_versions from "../workflows/versions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "ai/conversations": typeof ai_conversations;
  "ai/messages": typeof ai_messages;
  api_keys: typeof api_keys;
  billing: typeof billing;
  canvas: typeof canvas;
  http: typeof http;
  kanban: typeof kanban;
  projects: typeof projects;
  "schema/auth": typeof schema_auth;
  "schema/features": typeof schema_features;
  "schema/workflows": typeof schema_workflows;
  users: typeof users;
  "workflows/_utils": typeof workflows__utils;
  "workflows/cron": typeof workflows_cron;
  "workflows/crud": typeof workflows_crud;
  "workflows/runs": typeof workflows_runs;
  "workflows/secrets": typeof workflows_secrets;
  "workflows/versions": typeof workflows_versions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
