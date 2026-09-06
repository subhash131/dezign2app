import { Parameter, Schema, UIEventItem } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";
import { METHOD_BADGE_CLASSES, ResolvedEventParameters } from "./types";
import { extractPathPlaceholders, inferTypesFromJson } from "./paramUtils";

export function resolveEventParameters({
  url,
  method,
  requireAuth = true,
  customHeaders,
  customQueryParams,
  customRequestBody,
  eventItem,
  endpoint,
}: {
  url: string;
  method: string;
  requireAuth?: boolean;
  customHeaders?: Record<string, string>;
  customQueryParams?: Record<string, string>;
  customRequestBody?: unknown;
  eventItem?: UIEventItem;
  endpoint?: Endpoint;
}): ResolvedEventParameters {
  const upperMethod = (method || "POST").toUpperCase();
  const methodBadgeClass =
    METHOD_BADGE_CLASSES[upperMethod] ||
    "bg-secondary/40 text-secondary-foreground border-border";

  // Path Parameters (from pathname only, never ports)
  const configuredPathParams: Parameter[] = (
    eventItem?.pathParams?.length
      ? eventItem.pathParams
      : endpoint?.pathParams || []
  ).filter((p) => Boolean(p && typeof p.name === "string" && p.name.trim().length > 0));

  const pathPlaceholders = extractPathPlaceholders(url);
  const mergedPathParams: Parameter[] = [...configuredPathParams];
  pathPlaceholders.forEach((ph) => {
    const cleanPh = ph.trim();
    if (cleanPh && !mergedPathParams.some((p) => p.name === cleanPh)) {
      mergedPathParams.push({
        id: cleanPh,
        name: cleanPh,
        type: "string",
        required: true,
        defaultValue: "",
      });
    }
  });

  // Query Parameters
  const configuredQueryParams: Parameter[] = (
    eventItem?.queryParams?.length
      ? eventItem.queryParams
      : endpoint?.queryParams || endpoint?.params || []
  ).filter((q) => Boolean(q && typeof q.name === "string" && q.name.trim().length > 0));

  const mergedQueryParams: Parameter[] = [...configuredQueryParams];
  if (customQueryParams) {
    Object.entries(customQueryParams).forEach(([k, v]) => {
      const cleanKey = k.trim();
      if (cleanKey && !mergedQueryParams.some((p) => p.name === cleanKey)) {
        mergedQueryParams.push({
          id: cleanKey,
          name: cleanKey,
          type: "string",
          required: false,
          defaultValue: v,
        });
      }
    });
  }

  // Headers (include Authorization if requireAuth !== false)
  const configuredHeaders: Parameter[] = (
    eventItem?.headers?.length ? eventItem.headers : endpoint?.headers || []
  ).filter((h) => Boolean(h && typeof h.name === "string" && h.name.trim().length > 0));

  const mergedHeaders: Parameter[] = configuredHeaders.filter(
    (h) => h.name.toLowerCase() !== "content-type",
  );

  if (
    requireAuth !== false &&
    !mergedHeaders.some((h) => h.name.toLowerCase() === "authorization")
  ) {
    mergedHeaders.unshift({
      id: "auth-header",
      name: "Authorization",
      type: "string",
      required: true,
      defaultValue: "",
      description: "Bearer authentication token",
    });
  }

  if (customHeaders) {
    Object.entries(customHeaders).forEach(([k, v]) => {
      const cleanKey = k.trim();
      if (
        cleanKey &&
        cleanKey.toLowerCase() !== "content-type" &&
        !mergedHeaders.some((h) => h.name.toLowerCase() === cleanKey.toLowerCase())
      ) {
        mergedHeaders.push({
          id: cleanKey,
          name: cleanKey,
          type: "string",
          required: false,
          defaultValue: v,
        });
      }
    });
  }

  // Request Body
  const isBodyAllowedMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(
    upperMethod,
  );
  const rawRequestBodySchema: Schema | undefined =
    eventItem?.requestBody || endpoint?.requestBody;
  const requestBodyMode =
    eventItem?.requestBodyMode ??
    endpoint?.requestBodyMode ??
    (rawRequestBodySchema?.rawJson ? "raw_json" : "field_builder");

  const rawBodyFields: Parameter[] =
    isBodyAllowedMethod && requestBodyMode === "field_builder"
      ? rawRequestBodySchema?.fields || []
      : [];

  const bodyFields: Parameter[] = rawBodyFields.filter(
    (f) => Boolean(f && typeof f.name === "string" && f.name.trim().length > 0),
  );

  let rawJsonTemplate = "";
  let inferredJsonFields: [string, string][] = [];
  if (isBodyAllowedMethod) {
    if (requestBodyMode === "raw_json" && rawRequestBodySchema?.rawJson) {
      rawJsonTemplate = rawRequestBodySchema.rawJson.trim();
      inferredJsonFields = inferTypesFromJson(rawJsonTemplate);
    } else if (bodyFields.length === 0 && customRequestBody !== undefined) {
      try {
        rawJsonTemplate = JSON.stringify(customRequestBody, null, 2);
        inferredJsonFields = inferTypesFromJson(rawJsonTemplate);
      } catch {}
    }
  }

  const hasPathParams = mergedPathParams.length > 0;
  const hasQueryParams = mergedQueryParams.length > 0;
  const hasHeaders = mergedHeaders.length > 0;
  const hasBodyFields = bodyFields.length > 0;
  const hasRawJson = Boolean(rawJsonTemplate);

  const hasFields =
    hasPathParams ||
    hasQueryParams ||
    hasHeaders ||
    hasBodyFields ||
    hasRawJson;

  const pathParamsDefault = JSON.stringify(
    Object.fromEntries(
      mergedPathParams.map((p) => [p.name, p.defaultValue || "1"]),
    ),
    null,
    2,
  );

  const queryParamsDefault = JSON.stringify(
    Object.fromEntries(
      mergedQueryParams.map((q) => [q.name, q.defaultValue || ""]),
    ),
    null,
    2,
  );

  const headersDefault = JSON.stringify(
    Object.fromEntries(
      mergedHeaders.map((h) => [h.name, h.defaultValue || ""]),
    ),
    null,
    2,
  );

  const bodyFieldsDefault = JSON.stringify(
    Object.fromEntries(
      bodyFields.map((f) => [
        f.name,
        f.defaultValue !== undefined
          ? f.defaultValue
          : f.type === "number"
          ? 0
          : f.type === "boolean"
          ? false
          : "",
      ]),
    ),
    null,
    2,
  );

  const defaultRawJsonString = JSON.stringify(
    rawJsonTemplate || "{\n  \n}",
  );

  return {
    upperMethod,
    methodBadgeClass,
    mergedPathParams,
    mergedQueryParams,
    mergedHeaders,
    bodyFields,
    rawJsonTemplate,
    inferredJsonFields,
    isBodyAllowedMethod,
    hasPathParams,
    hasQueryParams,
    hasHeaders,
    hasBodyFields,
    hasRawJson,
    hasFields,
    pathParamsDefault,
    queryParamsDefault,
    headersDefault,
    bodyFieldsDefault,
    defaultRawJsonString,
  };
}
