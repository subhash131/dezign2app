import { UIEventItem, Parameter, Schema } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";

export interface EventComponentMeta {
  componentName: string;
  eventName: string;
  eventType: string;
  url: string;
  method: string;
  targetRoute?: string;
  targetPageLabel?: string;
  requireAuth?: boolean;
  customHeaders?: Record<string, string>;
  queryParams?: Record<string, string>;
  requestBody?: unknown;
  eventItem?: UIEventItem;
  endpoint?: Endpoint;
  serviceName?: string;
}

export const METHOD_BADGE_CLASSES: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  PATCH: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30",
  DELETE: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  WS: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  SSE: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
};

export interface ResolvedEventParameters {
  upperMethod: string;
  methodBadgeClass: string;
  mergedPathParams: Parameter[];
  mergedQueryParams: Parameter[];
  mergedHeaders: Parameter[];
  bodyFields: Parameter[];
  rawJsonTemplate: string;
  inferredJsonFields: [string, string][];
  isBodyAllowedMethod: boolean;
  hasPathParams: boolean;
  hasQueryParams: boolean;
  hasHeaders: boolean;
  hasBodyFields: boolean;
  hasRawJson: boolean;
  hasFields: boolean;
  pathParamsDefault: string;
  queryParamsDefault: string;
  headersDefault: string;
  bodyFieldsDefault: string;
  defaultRawJsonString: string;
}
